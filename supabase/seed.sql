-- Synthetic companion accounts make a fresh development project immediately usable.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'maya.bot@pay2chat.invalid', '{"provider":"email","providers":["email"]}', '{"display_name":"Maya","username":"maya"}', now(), now()),
  ('f0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'arjun.bot@pay2chat.invalid', '{"provider":"email","providers":["email"]}', '{"display_name":"Arjun","username":"arjun"}', now(), now()),
  ('f0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'noor.bot@pay2chat.invalid', '{"provider":"email","providers":["email"]}', '{"display_name":"Noor","username":"noor"}', now(), now()),
  ('f0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'kabir.bot@pay2chat.invalid', '{"provider":"email","providers":["email"]}', '{"display_name":"Kabir","username":"kabir"}', now(), now()),
  ('f0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'riya.bot@pay2chat.invalid', '{"provider":"email","providers":["email"]}', '{"display_name":"Riya","username":"riya"}', now(), now()),
  ('f0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'dev.bot@pay2chat.invalid', '{"provider":"email","providers":["email"]}', '{"display_name":"Dev","username":"dev"}', now(), now())
on conflict (id) do nothing;

update public.users set username = 'maya', display_name = 'Maya', gender = 'female', role = 'bot', is_verified = true, status = 'online'
where id = 'f0000000-0000-4000-8000-000000000001';
update public.users set username = 'arjun', display_name = 'Arjun', gender = 'male', role = 'bot', is_verified = true, status = 'online'
where id = 'f0000000-0000-4000-8000-000000000002';
update public.users set username = 'noor', display_name = 'Noor', gender = 'female', role = 'bot', is_verified = true, status = 'online'
where id = 'f0000000-0000-4000-8000-000000000003';
update public.users set username = 'kabir', display_name = 'Kabir', gender = 'male', role = 'bot', is_verified = true, status = 'online'
where id = 'f0000000-0000-4000-8000-000000000004';
update public.users set username = 'riya', display_name = 'Riya', gender = 'female', role = 'bot', is_verified = true, status = 'online'
where id = 'f0000000-0000-4000-8000-000000000005';
update public.users set username = 'dev', display_name = 'Dev', gender = 'male', role = 'bot', is_verified = true, status = 'online'
where id = 'f0000000-0000-4000-8000-000000000006';

update public.profiles set
  bio = 'Coffee, city walks, and conversations that wander somewhere unexpected.', age = 27,
  location = 'Mumbai', languages = array['English', 'Hindi'], chat_rate_coins = 2,
  audio_call_rate_coins = 15, video_call_rate_coins = 25, tags = array['Coffee', 'Art', 'Night owl']
where user_id = 'f0000000-0000-4000-8000-000000000001';
update public.profiles set
  bio = 'Weekend trekker, weekday product nerd. Ask me for a trail recommendation.', age = 30,
  location = 'Delhi', languages = array['English', 'Hindi'], chat_rate_coins = 3,
  audio_call_rate_coins = 18, video_call_rate_coins = 30, tags = array['Travel', 'Fitness', 'Tech']
where user_id = 'f0000000-0000-4000-8000-000000000002';
update public.profiles set
  bio = 'Illustrator, amateur baker, and collector of beautifully ordinary stories.', age = 26,
  location = 'Bengaluru', languages = array['English', 'Urdu'], free_chat_enabled = true,
  chat_rate_coins = 0, audio_call_rate_coins = 16, video_call_rate_coins = 28, tags = array['Design', 'Food', 'Books']
where user_id = 'f0000000-0000-4000-8000-000000000003';
update public.profiles set
  bio = 'Music is usually playing. Here for thoughtful chats and very bad puns.', age = 32,
  location = 'Pune', languages = array['English', 'Hindi', 'Marathi'], chat_rate_coins = 4,
  audio_call_rate_coins = 20, video_call_rate_coins = 35, tags = array['Music', 'Movies', 'Humor']
where user_id = 'f0000000-0000-4000-8000-000000000004';
update public.profiles set
  bio = 'Bookshop browser, sunrise person, and an enthusiastic listener.', age = 25,
  location = 'Jaipur', languages = array['English', 'Hindi'], chat_rate_coins = 2,
  audio_call_rate_coins = 14, video_call_rate_coins = 24, tags = array['Books', 'Wellness', 'Travel']
where user_id = 'f0000000-0000-4000-8000-000000000005';
update public.profiles set
  bio = 'Based by the sea. I cook, surf, and can talk films for far too long.', age = 29,
  location = 'Goa', languages = array['English', 'Hindi', 'Konkani'], chat_rate_coins = 3,
  audio_call_rate_coins = 17, video_call_rate_coins = 29, tags = array['Surfing', 'Cooking', 'Cinema']
where user_id = 'f0000000-0000-4000-8000-000000000006';

insert into public.profile_media (user_id, media_type, cloudinary_public_id, cloudinary_url, position, is_primary)
values
  ('f0000000-0000-4000-8000-000000000001', 'image', 'demo/maya-portrait', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=85', 0, true),
  ('f0000000-0000-4000-8000-000000000001', 'image', 'demo/maya-coffee', 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=85', 1, false),
  ('f0000000-0000-4000-8000-000000000002', 'image', 'demo/arjun-portrait', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1200&q=85', 0, true),
  ('f0000000-0000-4000-8000-000000000002', 'image', 'demo/arjun-hike', 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=85', 1, false),
  ('f0000000-0000-4000-8000-000000000003', 'image', 'demo/noor-portrait', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=85', 0, true),
  ('f0000000-0000-4000-8000-000000000003', 'image', 'demo/noor-art', 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=1200&q=85', 1, false),
  ('f0000000-0000-4000-8000-000000000004', 'image', 'demo/kabir-portrait', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=85', 0, true),
  ('f0000000-0000-4000-8000-000000000004', 'image', 'demo/kabir-music', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=85', 1, false),
  ('f0000000-0000-4000-8000-000000000005', 'image', 'demo/riya-portrait', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=1200&q=85', 0, true),
  ('f0000000-0000-4000-8000-000000000005', 'image', 'demo/riya-books', 'https://images.unsplash.com/photo-1526243741027-444d633d7365?auto=format&fit=crop&w=1200&q=85', 1, false),
  ('f0000000-0000-4000-8000-000000000006', 'image', 'demo/dev-portrait', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=85', 0, true),
  ('f0000000-0000-4000-8000-000000000006', 'image', 'demo/dev-beach', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85', 1, false)
on conflict (user_id, cloudinary_public_id) do nothing;
