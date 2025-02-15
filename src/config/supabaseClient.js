const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.PROD_SUPABASE_URL,
  process.env.PROD_SUPABASE_KEY
);

module.exports = supabase;
