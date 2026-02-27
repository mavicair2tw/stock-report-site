insert into roles(code,name) values
('GUEST','Guest'),
('NEW_USER','New User'),
('VERIFIED_USER','Verified User'),
('TRUSTED_USER','Trusted User'),
('MODERATOR','Moderator'),
('ADMIN','Admin')
on conflict (code) do nothing;

insert into categories(slug,title,description)
values
('general','General','General discussion'),
('tech','Tech','Technology topics'),
('news','News','News and announcements')
on conflict (slug) do nothing;
