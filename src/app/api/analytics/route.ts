import { GoogleAdsApi } from "google-ads-api";
import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Config ───────────────────────────────────────────────────────────

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const META_PAGE_ID = process.env.META_PAGE_ID || '';
const INSTAGRAM_BUSINESS_ID = process.env.INSTAGRAM_BUSINESS_ID || '';
const PINTEREST_ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN || '';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'vividwalls-2.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || 'act_777751590847461';
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '';
const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
const GOOGLE_ADS_CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || '';
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
const GOOGLE_ADS_REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN || '';
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || '';
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '';
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
const TIKTOK_ADVERTISER_ID = process.env.TIKTOK_ADVERTISER_ID || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

// Model pricing (per 1M tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
  'gpt-5.3-codex': { input: 2.0, output: 8.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gemini-2.5-pro': { input: 1.25, output: 5.0 },
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
};

// Fixed monthly costs (manually configured)
const FIXED_COSTS = {
  shopify: { name: 'Shopify Basic', monthly: 39.0 },
  sendgrid: { name: 'SendGrid', monthly: 0.0 },  // Free tier
  apollo: { name: 'Apollo.io', monthly: 0.0 },     // Free tier
  domain: { name: 'Domain (vividwalls.co)', monthly: 1.5 },
};

// ─── Helpers ──────────────────────────────────────────────────────────

async function safeFetch(url: string, opts?: RequestInit) {
  try {
    const res = await fetch(url, { ...opts, next: { revalidate: 300 } });
    if (!res.ok) return { error: `${res.status} ${res.statusText}`, data: null };
    return { error: null, data: await res.json() };
  } catch (e: any) {
    return { error: e.message, data: null };
  }
}

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    since: Math.floor(start.getTime() / 1000),
    until: Math.floor(end.getTime() / 1000),
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

// ─── Facebook ─────────────────────────────────────────────────────────

async function fetchFacebook(days: number) {
  if (!META_ACCESS_TOKEN || !META_PAGE_ID) {
    return { configured: false, error: 'META_ACCESS_TOKEN or META_PAGE_ID not set' };
  }
  const { since, until } = dateRange(days);
  const metrics = 'page_impressions_unique,page_post_engagements,page_views_total,page_actions_post_reactions_total';
  const url = `https://graph.facebook.com/v21.0/${META_PAGE_ID}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${META_ACCESS_TOKEN}`;
  const { error, data } = await safeFetch(url);
  if (error) return { configured: true, error, metrics: null };

  const result: Record<string, { total: number; daily: { date: string; value: number }[] }> = {};
  for (const entry of data?.data || []) {
    const daily = (entry.values || []).map((v: any) => ({
      date: v.end_time?.split('T')[0] || '',
      value: v.value || 0,
    }));
    const total = daily.reduce((s: number, d: any) => s + d.value, 0);
    result[entry.name] = { total, daily };
  }

  const pageUrl = `https://graph.facebook.com/v21.0/${META_PAGE_ID}?fields=name,fan_count,followers_count&access_token=${META_ACCESS_TOKEN}`;
  const pageInfo = await safeFetch(pageUrl);

  return {
    configured: true,
    error: null,
    page: pageInfo.data ? { name: pageInfo.data.name, fans: pageInfo.data.fan_count, followers: pageInfo.data.followers_count } : null,
    metrics: result,
    period: `${days}d`,
  };
}

// ─── Instagram ────────────────────────────────────────────────────────

async function fetchInstagram(days: number) {
  if (!META_ACCESS_TOKEN || !INSTAGRAM_BUSINESS_ID) {
    return { configured: false, error: 'META_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ID not set' };
  }
  const { since, until } = dateRange(days);

  const totalMetrics = 'reach,total_interactions,accounts_engaged,profile_views,follows_and_unfollows';
  const totalUrl = `https://graph.facebook.com/v21.0/${INSTAGRAM_BUSINESS_ID}/insights?metric=${totalMetrics}&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${META_ACCESS_TOKEN}`;
  const { error, data } = await safeFetch(totalUrl);
  if (error) return { configured: true, error, metrics: null };

  const result: Record<string, { total: number; daily: { date: string; value: number }[] }> = {};
  for (const entry of data?.data || []) {
    const totalValue = entry.total_value?.value || 0;
    result[entry.name] = { total: totalValue, daily: [] };
  }

  const dailyUrl = `https://graph.facebook.com/v21.0/${INSTAGRAM_BUSINESS_ID}/insights?metric=reach&period=day&since=${since}&until=${until}&access_token=${META_ACCESS_TOKEN}`;
  const dailyRes = await safeFetch(dailyUrl);
  if (dailyRes.data?.data?.[0]) {
    const daily = (dailyRes.data.data[0].values || []).map((v: any) => ({
      date: v.end_time?.split('T')[0] || '',
      value: v.value || 0,
    }));
    result['reach'] = { total: result['reach']?.total || daily.reduce((s: number, d: any) => s + d.value, 0), daily };
  }

  const accountUrl = `https://graph.facebook.com/v21.0/${INSTAGRAM_BUSINESS_ID}?fields=followers_count,media_count,username&access_token=${META_ACCESS_TOKEN}`;
  const accountRes = await safeFetch(accountUrl);
  if (accountRes.data) {
    result['follower_count'] = { total: accountRes.data.followers_count || 0, daily: [] };
    result['media_count'] = { total: accountRes.data.media_count || 0, daily: [] };
  }

  const mediaUrl = `https://graph.facebook.com/v21.0/${INSTAGRAM_BUSINESS_ID}/media?fields=id,caption,timestamp,like_count,comments_count,media_type,permalink&limit=12&access_token=${META_ACCESS_TOKEN}`;
  const mediaRes = await safeFetch(mediaUrl);
  const recentPosts = (mediaRes.data?.data || []).map((m: any) => ({
    id: m.id,
    caption: (m.caption || '').slice(0, 80),
    date: m.timestamp?.split('T')[0],
    likes: m.like_count || 0,
    comments: m.comments_count || 0,
    type: m.media_type,
    url: m.permalink,
  }));

  return { configured: true, error: null, metrics: result, recentPosts, period: `${days}d` };
}

// ─── Pinterest ────────────────────────────────────────────────────────

async function fetchPinterest(days: number) {
  if (!PINTEREST_ACCESS_TOKEN) {
    return { configured: false, error: 'PINTEREST_ACCESS_TOKEN not set' };
  }
  const { startDate, endDate } = dateRange(days);

  const url = `https://api.pinterest.com/v5/user_account/analytics?start_date=${startDate}&end_date=${endDate}&metric_types=IMPRESSION,ENGAGEMENT,SAVE,PIN_CLICK,OUTBOUND_CLICK`;
  const headers = { Authorization: `Bearer ${PINTEREST_ACCESS_TOKEN}` };
  const { error, data } = await safeFetch(url, { headers });
  if (error) return { configured: true, error, metrics: null };

  const totals: Record<string, number> = {};
  const daily: { date: string; impressions: number; clicks: number; saves: number }[] = [];

  // Use summary_metrics for totals (most reliable)
  if (data?.all?.summary_metrics) {
    for (const [k, v] of Object.entries(data.all.summary_metrics)) {
      if (typeof v === 'number') totals[k] = v;
    }
  }

  // Parse daily_metrics for time series (metrics are nested inside .metrics)
  if (data?.all?.daily_metrics) {
    for (const day of data.all.daily_metrics) {
      if (day.data_status !== 'READY') continue;
      const m = day.metrics || {};
      daily.push({
        date: day.date || '',
        impressions: m.IMPRESSION || 0,
        clicks: m.PIN_CLICK || 0,
        saves: m.SAVE || 0,
      });
      // If no summary_metrics, accumulate from daily
      if (!data.all.summary_metrics) {
        for (const [k, v] of Object.entries(m)) {
          if (typeof v === 'number') totals[k] = (totals[k] || 0) + v;
        }
      }
    }
  }

  const pinsUrl = `https://api.pinterest.com/v5/pins?page_size=12`;
  const pinsRes = await safeFetch(pinsUrl, { headers });
  const recentPins = (pinsRes.data?.items || []).map((p: any) => ({
    id: p.id,
    title: (p.title || p.description || '').slice(0, 80),
    date: p.created_at?.split('T')[0],
    link: p.link,
  }));

  return { configured: true, error: null, totals, daily, recentPins, period: `${days}d` };
}

// ─── SendGrid ─────────────────────────────────────────────────────────

async function fetchSendGrid() {
  if (!SENDGRID_API_KEY) {
    return { configured: false, error: 'SENDGRID_API_KEY not set' };
  }
  const headers = { Authorization: `Bearer ${SENDGRID_API_KEY}` };

  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const statsUrl = `https://api.sendgrid.com/v3/stats?start_date=${start}&end_date=${end}&aggregated_by=day`;
  const statsRes = await safeFetch(statsUrl, { headers });

  let totalSent = 0, totalDelivered = 0, totalOpens = 0, totalClicks = 0,
      totalBounces = 0, totalBlocks = 0, totalSpam = 0, totalUnsubscribes = 0;
  const daily: { date: string; delivered: number; opens: number; clicks: number }[] = [];

  for (const day of statsRes.data || []) {
    const m = day.stats?.[0]?.metrics || {};
    totalSent += m.requests || 0;
    totalDelivered += m.delivered || 0;
    totalOpens += m.unique_opens || 0;
    totalClicks += m.unique_clicks || 0;
    totalBounces += m.bounces || 0;
    totalBlocks += m.blocks || 0;
    totalSpam += m.spam_reports || 0;
    totalUnsubscribes += m.unsubscribes || 0;
    daily.push({
      date: day.date,
      delivered: m.delivered || 0,
      opens: m.unique_opens || 0,
      clicks: m.unique_clicks || 0,
    });
  }

  const listsUrl = 'https://api.sendgrid.com/v3/marketing/lists?page_size=20';
  const listsRes = await safeFetch(listsUrl, { headers });
  const lists = (listsRes.data?.result || []).map((l: any) => ({
    id: l.id,
    name: l.name,
    contact_count: l.contact_count,
  }));

  const contactsUrl = 'https://api.sendgrid.com/v3/marketing/contacts/count';
  const contactsRes = await safeFetch(contactsUrl, { headers });
  const totalContacts = contactsRes.data?.contact_count || 0;

  const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : '0';
  const openRate = totalDelivered > 0 ? ((totalOpens / totalDelivered) * 100).toFixed(1) : '0';
  const clickRate = totalDelivered > 0 ? ((totalClicks / totalDelivered) * 100).toFixed(1) : '0';

  // Credit usage
  const creditsUrl = 'https://api.sendgrid.com/v3/user/credits';
  const creditsRes = await safeFetch(creditsUrl, { headers });
  const credits = creditsRes.data ? {
    remain: creditsRes.data.remain || 0,
    total: creditsRes.data.total || 0,
    used: creditsRes.data.used || 0,
    nextReset: creditsRes.data.next_reset || '',
  } : null;

  return {
    configured: true,
    error: null,
    summary: {
      totalContacts, totalSent, totalDelivered, totalOpens, totalClicks,
      totalBounces, totalBlocks, totalSpam, totalUnsubscribes,
      deliveryRate: `${deliveryRate}%`,
      openRate: `${openRate}%`,
      clickRate: `${clickRate}%`,
    },
    lists, daily, credits, period: '30d',
  };
}

// ─── Shopify ──────────────────────────────────────────────────────────

async function fetchShopify() {
  if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE) {
    return { configured: false, error: 'SHOPIFY_ACCESS_TOKEN or SHOPIFY_STORE not set' };
  }
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-10/graphql.json`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
  };

  // Orders (last 50)
  const ordersQuery = `{
    orders(first: 50, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 5) { edges { node { title quantity } } }
        }
      }
    }
    shop { name plan { displayName } currencyCode myshopifyDomain }
  }`;

  const ordersRes = await safeFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: ordersQuery }),
  });

  if (ordersRes.error) return { configured: true, error: ordersRes.error };

  const orders = (ordersRes.data?.data?.orders?.edges || []).map((e: any) => {
    const o = e.node;
    return {
      id: o.id,
      name: o.name,
      date: o.createdAt?.split('T')[0],
      status: o.displayFinancialStatus,
      fulfillment: o.displayFulfillmentStatus,
      total: parseFloat(o.totalPriceSet?.shopMoney?.amount || '0'),
      currency: o.totalPriceSet?.shopMoney?.currencyCode || 'USD',
      items: (o.lineItems?.edges || []).map((li: any) => ({
        title: li.node.title,
        quantity: li.node.quantity,
      })),
    };
  });

  const shop = ordersRes.data?.data?.shop || {};

  // Product count
  const productQuery = `{ productsCount { count } }`;
  const productRes = await safeFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: productQuery }),
  });
  const productCount = productRes.data?.data?.productsCount?.count || 0;

  // Aggregate stats
  const totalRevenue = orders.reduce((s: number, o: any) => s + o.total, 0);
  const paidOrders = orders.filter((o: any) => o.status === 'PAID' || o.status === 'PARTIALLY_REFUNDED');
  const paidRevenue = paidOrders.reduce((s: number, o: any) => s + o.total, 0);
  const aov = paidOrders.length > 0 ? paidRevenue / paidOrders.length : 0;

  // Monthly breakdown
  const monthlyRevenue: Record<string, number> = {};
  for (const o of orders) {
    const month = o.date?.slice(0, 7) || 'unknown';
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + o.total;
  }

  return {
    configured: true,
    error: null,
    shop: { name: shop.name, plan: shop.plan?.displayName, currency: shop.currencyCode, domain: shop.myshopifyDomain },
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      paidRevenue: Math.round(paidRevenue * 100) / 100,
      totalOrders: orders.length,
      paidOrders: paidOrders.length,
      aov: Math.round(aov * 100) / 100,
      productCount,
    },
    monthlyRevenue: Object.entries(monthlyRevenue).map(([month, revenue]) => ({ month, revenue: Math.round(revenue as number * 100) / 100 })),
    recentOrders: orders.slice(0, 10),
  };
}


// ─── Shopify Online Store Analytics ──────────────────────────────────

async function fetchShopifyAnalytics(days: number) {
  if (!SHOPIFY_ACCESS_TOKEN || !SHOPIFY_STORE) {
    return { configured: false, error: 'SHOPIFY_ACCESS_TOKEN or SHOPIFY_STORE not set' };
  }

  try {
    const url = `https://${SHOPIFY_STORE}/admin/api/2024-10/graphql.json`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    };

    // Fetch orders with billing address for geographic data
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    const ordersQuery = `{
      orders(first: 250, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            createdAt
            totalPriceSet { shopMoney { amount } }
            billingAddress { countryCode country }
          }
        }
      }
    }`;

    const ordersRes = await safeFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: ordersQuery }),
    });

    if (ordersRes.error) return { configured: true, error: ordersRes.error };

    const edges = ordersRes.data?.data?.orders?.edges || [];
    const countryMap: Record<string, { name: string; orders: number; revenue: number }> = {};
    const dailyMap: Record<string, { orders: number; revenue: number }> = {};
    let totalOrders = 0;
    let totalRevenue = 0;
    const sinceDate = since.toISOString().split('T')[0];

    for (const { node } of edges) {
      const date = (node.createdAt || '').split('T')[0];
      if (date < sinceDate) continue; // Skip orders before the period
      const revenue = parseFloat(node.totalPriceSet?.shopMoney?.amount || '0');
      const cc = node.billingAddress?.countryCode || 'XX';
      const cn = node.billingAddress?.country || 'Unknown';

      totalOrders++;
      totalRevenue += revenue;

      if (!countryMap[cc]) countryMap[cc] = { name: cn, orders: 0, revenue: 0 };
      countryMap[cc].orders++;
      countryMap[cc].revenue += revenue;

      if (!dailyMap[date]) dailyMap[date] = { orders: 0, revenue: 0 };
      dailyMap[date].orders++;
      dailyMap[date].revenue += revenue;
    }

    // Build daily series (fill gaps)
    const dailySessions: { date: string; sessions: number; pageviews: number; visitors: number }[] = [];
    const now = new Date();
    for (let d = new Date(since); d <= now; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      const day = dailyMap[ds] || { orders: 0, revenue: 0 };
      dailySessions.push({ date: ds, sessions: day.orders, pageviews: day.orders, visitors: day.orders });
    }

    // Build country list sorted by orders desc
    const byCountry = Object.entries(countryMap)
      .sort((a, b) => b[1].orders - a[1].orders)
      .map(([code, data]) => ({
        country: data.name,
        countryCode: code.toLowerCase(),
        sessions: data.orders,
        visitors: data.orders,
        revenue: Math.round(data.revenue * 100) / 100,
      }));

    return {
      configured: true,
      error: null,
      summary: {
        totalSessions: totalOrders,
        totalPageviews: totalOrders,
        totalVisitors: totalOrders,
      },
      dailySessions,
      byCountry,
      period: `${days}d`,
    };
  } catch (e: any) {
    return { configured: true, error: e.message };
  }
}

// ─── LLM Token Costs ─────────────────────────────────────────────────

function fetchTokenCosts() {
  const agentsDir = join(homedir(), '.openclaw', 'agents');
  if (!existsSync(agentsDir)) {
    return { configured: false, error: 'OpenClaw agents directory not found' };
  }

  const byModel: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number; calls: number; cost: number }> = {};
  const byAgent: Record<string, { input: number; output: number; calls: number; cost: number }> = {};
  const byProvider: Record<string, { calls: number; cost: number; input: number; output: number }> = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;
  let totalCalls = 0;

  try {
    const agents = readdirSync(agentsDir);
    for (const agent of agents) {
      const sessionsDir = join(agentsDir, agent, 'sessions');
      if (!existsSync(sessionsDir)) continue;

      let jsonlFiles: string[];
      try {
        jsonlFiles = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      } catch { continue; }

      for (const file of jsonlFiles) {
        try {
          const raw = readFileSync(join(sessionsDir, file), 'utf-8');
          const lines = raw.split('\n');
          for (const line of lines) {
            if (!line.trim() || !line.includes('usage')) continue;
            try {
              const d = JSON.parse(line);
              if (d.type !== 'message') continue;
              const msg = d.message;
              if (!msg?.usage?.cost?.total) continue;

              const usage = msg.usage;
              const cost = usage.cost.total || 0;
              const inp = usage.input || 0;
              const out = usage.output || 0;
              const cacheRead = usage.cacheRead || 0;
              const cacheWrite = usage.cacheWrite || 0;
              const model = `${msg.provider || "unknown"}/${msg.model || "unknown"}`;

              totalCost += cost;
              totalCalls += 1;
              totalInput += inp;
              totalOutput += out;
              totalCacheRead += cacheRead;
              totalCacheWrite += cacheWrite;

              if (!byModel[model]) byModel[model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, cost: 0 };
              byModel[model].input += inp;
              byModel[model].output += out;
              byModel[model].cacheRead += cacheRead;
              byModel[model].cacheWrite += cacheWrite;
              byModel[model].calls += 1;
              byModel[model].cost += cost;

              if (!byAgent[agent]) byAgent[agent] = { input: 0, output: 0, calls: 0, cost: 0 };
              byAgent[agent].input += inp;
              byAgent[agent].output += out;
              byAgent[agent].calls += 1;
              byAgent[agent].cost += cost;

              const provider = (msg.provider || 'unknown').replace(/-.*/, '');
              if (!byProvider[provider]) byProvider[provider] = { calls: 0, cost: 0, input: 0, output: 0 };
              byProvider[provider].calls += 1;
              byProvider[provider].cost += cost;
              byProvider[provider].input += inp;
              byProvider[provider].output += out;
            } catch { /* skip malformed line */ }
          }
        } catch { /* skip unreadable file */ }
      }
    }
  } catch { /* skip */ }

  const round2 = (c: number) => Math.round(c * 100) / 100;

  return {
    configured: true,
    error: null,
    summary: {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCacheReadTokens: totalCacheRead,
      totalCacheWriteTokens: totalCacheWrite,
      totalTokens: totalInput + totalOutput + totalCacheRead + totalCacheWrite,
      totalCost: round2(totalCost),
      totalCalls,
    },
    byModel: Object.entries(byModel)
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([model, data]) => ({
        model,
        calls: data.calls,
        inputTokens: data.input,
        outputTokens: data.output,
        cacheReadTokens: data.cacheRead,
        cacheWriteTokens: data.cacheWrite,
        cost: round2(data.cost),
      })),
    byAgent: Object.entries(byAgent)
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([agent, data]) => ({
        agent,
        calls: data.calls,
        inputTokens: data.input,
        outputTokens: data.output,
        cost: round2(data.cost),
      })),
    byProvider: Object.entries(byProvider)
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([provider, data]) => ({
        provider,
        calls: data.calls,
        inputTokens: data.input,
        outputTokens: data.output,
        estimatedCost: round2(data.cost),
        billing: provider === 'anthropic' ? 'operator' : 'api',
      })),
  };
}

// ─── Apollo.io ────────────────────────────────────────────────────────

function fetchApollo() {
  const historyPath = join(homedir(), '.openclaw', 'workspace', 'businesses', 'vividwalls', 'marketing', 'apollo-pull-history.json');
  const leadsPath = join(homedir(), '.openclaw', 'workspace', 'businesses', 'vividwalls', 'marketing', 'apollo-leads.json');

  if (!existsSync(historyPath)) {
    return { configured: false, error: 'Apollo pull history not found' };
  }

  try {
    const history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    const pulls = history.pulls || [];

    let totalEnriched = 0;
    let totalNew = 0;
    let totalDupes = 0;
    let totalNoEmail = 0;
    const pullSummaries: { date: string; enriched: number; newLeads: number; personas: number }[] = [];

    for (const pull of pulls) {
      const enriched = pull.total_enriched || 0;
      const newLeads = pull.total_new || 0;
      totalEnriched += enriched;
      totalNew += newLeads;
      totalDupes += pull.total_dupes || 0;
      totalNoEmail += pull.total_no_email || 0;
      pullSummaries.push({
        date: (pull.started_at || '').slice(0, 10),
        enriched,
        newLeads,
        personas: Object.keys(pull.personas || {}).length,
      });
    }

    // Count total leads in file
    let totalLeads = 0;
    if (existsSync(leadsPath)) {
      try {
        const leads = JSON.parse(readFileSync(leadsPath, 'utf-8'));
        totalLeads = Array.isArray(leads) ? leads.length : Object.keys(leads.leads || leads.contacts || {}).length;
      } catch {}
    }

    return {
      configured: true,
      error: null,
      summary: {
        totalEnriched,
        totalNew,
        totalDupes,
        totalNoEmail,
        totalLeads,
        totalPulls: pulls.length,
        creditsUsed: totalEnriched,
        monthlyCredits: 10000,
      },
      pulls: pullSummaries,
    };
  } catch (e: any) {
    return { configured: true, error: e.message };
  }
}

// ─── Google Analytics (GA4) ────────────────────────────────────────────

async function fetchGoogleAnalytics(days: number) {
  if (!GA4_PROPERTY_ID || !GOOGLE_SERVICE_ACCOUNT_KEY) {
    return { configured: false, error: 'GA4_PROPERTY_ID or GOOGLE_SERVICE_ACCOUNT_KEY not set' };
  }

  try {
    // Decode service account key from base64
    const keyJson = JSON.parse(Buffer.from(GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8'));
    const { client_email, private_key } = keyJson;

    // Create JWT for Google API auth
    const crypto = await import('crypto');
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');
    const signInput = `${header}.${payload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signInput);
    const signature = sign.sign(private_key, 'base64url');
    const jwt = `${signInput}.${signature}`;

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    if (!tokenRes.ok) return { configured: true, error: `Token exchange failed: ${tokenRes.status}` };
    const { access_token } = await tokenRes.json();

    const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`;
    const apiHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` };

    // Main metrics report
    const { startDate, endDate } = dateRange(days);
    const metricsBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    };
    const metricsRes = await fetch(apiUrl, { method: 'POST', headers: apiHeaders, body: JSON.stringify(metricsBody) });
    if (!metricsRes.ok) return { configured: true, error: `GA4 API error: ${metricsRes.status}` };
    const metricsData = await metricsRes.json();

    let totalSessions = 0, totalUsers = 0, totalNewUsers = 0, totalPageViews = 0;
    let totalBounceRate = 0, totalDuration = 0, rowCount = 0;
    const dailySessions: { date: string; value: number }[] = [];

    for (const row of metricsData.rows || []) {
      const date = row.dimensionValues?.[0]?.value || '';
      const fmtDate = date.length === 8 ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}` : date;
      const sessions = parseInt(row.metricValues?.[0]?.value || '0');
      const users = parseInt(row.metricValues?.[1]?.value || '0');
      const newU = parseInt(row.metricValues?.[2]?.value || '0');
      const pv = parseInt(row.metricValues?.[3]?.value || '0');
      const br = parseFloat(row.metricValues?.[4]?.value || '0');
      const dur = parseFloat(row.metricValues?.[5]?.value || '0');

      totalSessions += sessions;
      totalUsers += users;
      totalNewUsers += newU;
      totalPageViews += pv;
      totalBounceRate += br;
      totalDuration += dur;
      rowCount++;
      dailySessions.push({ date: fmtDate, value: sessions });
    }

    const avgBounceRate = rowCount > 0 ? totalBounceRate / rowCount : 0;
    const avgDuration = rowCount > 0 ? totalDuration / rowCount : 0;

    // Top pages report
    const pagesBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    };
    const pagesRes = await fetch(apiUrl, { method: 'POST', headers: apiHeaders, body: JSON.stringify(pagesBody) });
    const pagesData = pagesRes.ok ? await pagesRes.json() : { rows: [] };
    const topPages = (pagesData.rows || []).map((row: any) => ({
      path: row.dimensionValues?.[0]?.value || '',
      pageViews: parseInt(row.metricValues?.[0]?.value || '0'),
      sessions: parseInt(row.metricValues?.[1]?.value || '0'),
    }));

    return {
      configured: true,
      error: null,
      summary: {
        totalSessions,
        totalUsers,
        totalNewUsers,
        totalPageViews,
        avgBounceRate: Math.round(avgBounceRate * 1000) / 10,
        avgDuration: Math.round(avgDuration),
      },
      dailySessions,
      topPages,
      period: `${days}d`,
    };
  } catch (e: any) {
    return { configured: true, error: e.message };
  }
}

// ─── Google Ads ────────────────────────────────────────────────────────

async function fetchGoogleAds(days: number) {
  if (!GOOGLE_ADS_CUSTOMER_ID || !GOOGLE_ADS_DEVELOPER_TOKEN || !GOOGLE_ADS_REFRESH_TOKEN || !GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET) {
    return { configured: false, error: 'Google Ads credentials not fully configured' };
  }

  try {
    const client = new GoogleAdsApi({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      developer_token: GOOGLE_ADS_DEVELOPER_TOKEN,
    });

    const customer = client.Customer({
      customer_id: GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, ''),
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      login_customer_id: GOOGLE_ADS_LOGIN_CUSTOMER_ID ? GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, '') : undefined,
    });

    const gaqlQuery = `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_per_conversion, segments.date FROM campaign WHERE segments.date DURING LAST_30_DAYS`;

    const results = await customer.query(gaqlQuery);

    let totalSpendMicros = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0;
    const dailySpend: Record<string, number> = {};

    for (const row of results) {
      const m = row.metrics || {};
      const date = row.segments?.date || '';
      const costMicros = Number(m.cost_micros || 0);
      const impressions = Number(m.impressions || 0);
      const clicks = Number(m.clicks || 0);
      const conversions = Number(m.conversions || 0);

      totalSpendMicros += costMicros;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalConversions += conversions;

      if (date) {
        dailySpend[date] = (dailySpend[date] || 0) + costMicros;
      }
    }

    const totalSpend = totalSpendMicros / 1_000_000;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

    const dailyData = Object.entries(dailySpend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, micros]) => ({ date, value: Math.round((micros as number) / 1_000_000 * 100) / 100 }));

    return {
      configured: true,
      error: null,
      spend: Math.round(totalSpend * 100) / 100,
      impressions: totalImpressions,
      clicks: totalClicks,
      conversions: Math.round(totalConversions * 10) / 10,
      cpc: Math.round(cpc * 100) / 100,
      dailySpend: dailyData,
      hasData: totalImpressions > 0,
      period: `${days}d`,
    };
  } catch (e: any) {
    const errMsg = e.message || e.details || (typeof e === "object" ? JSON.stringify(e) : String(e)) || "Unknown Google Ads error";
    console.error("[GoogleAds] Error:", errMsg);
    return { configured: true, error: errMsg };
  }
}


// ─── TikTok Ads ───────────────────────────────────────────────────────

async function fetchTikTok(days: number) {
  if (!TIKTOK_ACCESS_TOKEN || !TIKTOK_ADVERTISER_ID) {
    return { configured: false, error: 'TikTok credentials not configured' };
  }

  try {
    const { startDate, endDate } = dateRange(days);
    const url = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=${TIKTOK_ADVERTISER_ID}&report_type=BASIC&data_level=AUCTION_ADVERTISER&dimensions=["stat_time_day"]&metrics=["spend","impressions","clicks","conversion","cpc","cpm"]&start_date=${startDate}&end_date=${endDate}`;

    const res = await fetch(url, {
      headers: { 'Access-Token': TIKTOK_ACCESS_TOKEN },
    });
    if (!res.ok) return { configured: true, error: `TikTok API error: ${res.status}` };
    const data = await res.json();

    if (data.code !== 0) return { configured: true, error: data.message || 'TikTok API error' };

    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0;
    const dailySpend: { date: string; value: number }[] = [];

    for (const row of data.data?.list || []) {
      const m = row.metrics || {};
      totalSpend += parseFloat(m.spend || '0');
      totalImpressions += parseInt(m.impressions || '0');
      totalClicks += parseInt(m.clicks || '0');
      totalConversions += parseInt(m.conversion || '0');
      dailySpend.push({
        date: (row.dimensions?.stat_time_day || '').slice(0, 10),
        value: parseFloat(m.spend || '0'),
      });
    }

    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

    return {
      configured: true,
      error: null,
      spend: Math.round(totalSpend * 100) / 100,
      impressions: totalImpressions,
      clicks: totalClicks,
      conversions: totalConversions,
      cpc: Math.round(cpc * 100) / 100,
      dailySpend,
      hasData: totalImpressions > 0,
      period: `${days}d`,
    };
  } catch (e: any) {
    return { configured: true, error: e.message };
  }
}

// ─── Stripe ───────────────────────────────────────────────────────────

async function fetchStripe(days: number) {
  if (!STRIPE_SECRET_KEY) {
    return { configured: false, error: 'STRIPE_SECRET_KEY not set' };
  }

  try {
    const { since } = dateRange(days);
    const headers = { Authorization: `Bearer ${STRIPE_SECRET_KEY}` };

    // Fetch recent charges
    const chargesRes = await fetch(`https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}`, { headers });
    if (!chargesRes.ok) return { configured: true, error: `Stripe API error: ${chargesRes.status}` };
    const chargesData = await chargesRes.json();

    const charges = chargesData?.data || [];
    let totalRevenue = 0;
    let successCount = 0;
    let refundedCount = 0;
    let totalRefunded = 0;

    for (const charge of charges) {
      if (charge.status === 'succeeded') {
        totalRevenue += (charge.amount - (charge.amount_refunded || 0)) / 100;
        successCount++;
        if (charge.refunded || charge.amount_refunded > 0) {
          refundedCount++;
          totalRefunded += (charge.amount_refunded || 0) / 100;
        }
      }
    }

    const totalTransactions = charges.length;
    const successRate = totalTransactions > 0 ? (successCount / totalTransactions) * 100 : 0;
    const refundRate = successCount > 0 ? (refundedCount / successCount) * 100 : 0;
    const averageOrderValue = successCount > 0 ? totalRevenue / successCount : 0;

    // Fetch current balance
    const balanceRes = await fetch('https://api.stripe.com/v1/balance', { headers });
    const balanceData = balanceRes.ok ? await balanceRes.json() : null;
    const balance = balanceData?.available?.[0]?.amount
      ? balanceData.available[0].amount / 100
      : 0;

    const recentCharges = charges.slice(0, 10).map((c: any) => ({
      amount: c.amount / 100,
      currency: c.currency,
      created: c.created,
      status: c.status,
      description: c.description || '',
    }));

    return {
      configured: true,
      error: null,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalTransactions,
      successCount,
      successRate: Math.round(successRate * 10) / 10,
      refundRate: Math.round(refundRate * 10) / 10,
      totalRefunded: Math.round(totalRefunded * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      recentCharges,
      period: `${days}d`,
    };
  } catch (e: any) {
    return { configured: true, error: e.message };
  }
}

// ─── Meta Ads ─────────────────────────────────────────────────────────

async function fetchMetaAds(days: number) {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return { configured: false, error: 'META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set' };
  }
  const { startDate, endDate } = dateRange(days);

  const url = `https://graph.facebook.com/v21.0/${META_AD_ACCOUNT_ID}/insights?fields=spend,impressions,clicks,cpc,cpm,reach,actions&time_range={"since":"${startDate}","until":"${endDate}"}&access_token=${META_ACCESS_TOKEN}`;
  const { error, data } = await safeFetch(url);

  if (error) return { configured: true, error, spend: 0 };

  const insights = data?.data?.[0] || {};
  return {
    configured: true,
    error: null,
    spend: parseFloat(insights.spend || '0'),
    impressions: parseInt(insights.impressions || '0'),
    clicks: parseInt(insights.clicks || '0'),
    reach: parseInt(insights.reach || '0'),
    cpc: parseFloat(insights.cpc || '0'),
    cpm: parseFloat(insights.cpm || '0'),
    hasData: !!data?.data?.length,
  };
}

// ─── Cost Summary ─────────────────────────────────────────────────────

function buildCostSummary(tokenCosts: any, metaAds: any, googleAds?: any, tiktok?: any) {
  const llmEstimated = tokenCosts?.configured ? (tokenCosts?.summary?.totalCost || 0) : 0;
  const adSpend = (metaAds?.spend || 0) + (googleAds?.spend || 0) + (tiktok?.spend || 0);
  const fixedMonthly = Object.values(FIXED_COSTS).reduce((s, c) => s + (c as any).monthly, 0);

  // Separate operator-billed (Anthropic via Claude Code device-auth) from direct API-billed (OpenAI)
  const providers = tokenCosts?.byProvider || [];
  const operatorEstimated = providers.filter((p: any) => p.billing === 'operator').reduce((s: number, p: any) => s + p.estimatedCost, 0);
  const apiLlmCost = providers.filter((p: any) => p.billing === 'api').reduce((s: number, p: any) => s + p.estimatedCost, 0);

  return {
    llmEstimated,
    llmActual: apiLlmCost,
    operatorEstimated,
    adSpend,
    fixedMonthly,
    fixedBreakdown: Object.entries(FIXED_COSTS).map(([key, c]) => ({
      id: key,
      name: c.name,
      monthly: c.monthly,
    })),
    totalMonthly: Math.round((apiLlmCost + adSpend + fixedMonthly) * 100) / 100,
  };
}

// ─── Route Handler ────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '30', 10);

  const tokenCosts = fetchTokenCosts();

  const apollo = fetchApollo();

  const [facebook, instagram, pinterest, sendgrid, shopify, metaAds, googleAnalytics, googleAds, tiktok, stripe, shopifyAnalytics] = await Promise.all([
    fetchFacebook(days),
    fetchInstagram(days),
    fetchPinterest(days),
    fetchSendGrid(),
    fetchShopify(),
    fetchMetaAds(days),
    fetchGoogleAnalytics(days),
    fetchGoogleAds(days),
    fetchTikTok(days),
    fetchStripe(days),
    fetchShopifyAnalytics(days),
  ]);

  const costs = buildCostSummary(tokenCosts, metaAds, googleAds, tiktok);

  return NextResponse.json({
    facebook, instagram, pinterest, sendgrid, shopify, metaAds, googleAnalytics, googleAds, tiktok, stripe, shopifyAnalytics, tokenCosts, apollo, costs,
    fetchedAt: new Date().toISOString(),
  });
}
