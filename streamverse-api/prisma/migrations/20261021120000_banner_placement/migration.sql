-- Hero banners lead a sub-page (Movies / eBooks / Audiobooks); the homepage hero is managed in Homepage settings.
ALTER TABLE `Banner` ADD COLUMN `placement` ENUM('MOVIES', 'EBOOKS', 'AUDIOBOOKS') NULL;
