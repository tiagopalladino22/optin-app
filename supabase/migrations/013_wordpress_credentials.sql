-- Per-client WordPress credentials for publishing campaigns as posts.
alter table clients add column if not exists wordpress_url text;
alter table clients add column if not exists wordpress_username text;
alter table clients add column if not exists wordpress_password text;  -- Application Password
