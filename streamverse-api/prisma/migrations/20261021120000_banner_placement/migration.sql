-- Hero banners lead a sub-page (Movies / eBooks / Audiobooks); the homepage hero is managed in Homepage settings.
ALTER TABLE `banner` ADD COLUMN `placement` ENUM('MOVIES', 'EBOOKS', 'AUDIOBOOKS') NULL;
