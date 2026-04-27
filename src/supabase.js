const SUPABASE_URL = "https://pewdvheoaqofmzwhwwvu.supabase.co";
const SUPABASE_KEY = "sb_publishable_czodJ94LFy5iRcK9gCb2SA_uZGkRdGp";

function createClient() {
  let accessToken = null;
  let currentUser = null;

  const headers = () => ({
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_KEY}`,
  });

  const api = async (path, opts = {}) => {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      ...opts,
      headers: { ...headers(), ...opts.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.msg || err.error_description || res.statusText);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  const auth = {
    signIn: async (email, password) => {
      const data = await api("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      accessToken = data.access_token;
      currentUser = data.user;
      return data;
    },
    signOut: () => {
      accessToken = null;
      currentUser = null;
    },
    getUser: () => currentUser,
    getToken: () => accessToken,
  };

  const from = (table) => {
    let params = [];
    let method = "GET";
    let body = null;
    let isSingle = false;
    let returnData = false;
    let filterParams = [];

    const builder = {
      select: (cols = "*") => { params.push(`select=${encodeURIComponent(cols)}`); return builder; },
      eq: (col, val) => { filterParams.push(`${col}=eq.${encodeURIComponent(val)}`); return builder; },
      neq: (col, val) => { filterParams.push(`${col}=neq.${encodeURIComponent(val)}`); return builder; },
      order: (col, { ascending = true } = {}) => { params.push(`order=${col}.${ascending ? "asc" : "desc"}`); return builder; },
      limit: (n) => { params.push(`limit=${n}`); return builder; },
      single: () => { isSingle = true; params.push("limit=1"); return builder; },
      insert: (data) => { method = "POST"; body = JSON.stringify(data); returnData = true; return builder; },
      update: (data) => { method = "PATCH"; body = JSON.stringify(data); returnData = true; return builder; },
      delete: () => { method = "DELETE"; return builder; },
      then: async (resolve, reject) => {
        try {
          const allParams = [...params, ...filterParams];
          const query = allParams.length ? `?${allParams.join("&")}` : "";
          const h = { ...headers() };
          if (returnData) h["Prefer"] = "return=representation";
          const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { method, headers: h, body });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || res.statusText);
          }
          const text = await res.text();
          const result = text ? JSON.parse(text) : [];
          resolve({ data: isSingle ? result[0] || null : result, error: null });
        } catch (err) {
          if (reject) reject(err);
          else resolve({ data: null, error: err });
        }
      },
    };
    return builder;
  };

  return { auth, from, api };
}

export const supabase = createClient();
