-- v39: paid DIY listings stay live N days from payment (admin setting, default 90)
insert into public.app_settings (key, value) values ('paid_term', '{"days": 90}'::jsonb)
on conflict (key) do nothing;
