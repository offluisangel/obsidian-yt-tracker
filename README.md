# YouTube Tracker

YouTube Tracker keeps recent videos from your favorite YouTube channels in one place inside Obsidian.

## Quick start

1. Install the plugin from Obsidian Community Plugins once it is listed, or install the files from a GitHub release manually.
2. Open **YouTube Tracker** from the ribbon or command palette.
3. Choose **Add channel** and paste a YouTube channel URL or handle.
4. Choose **Refresh** whenever you want to check for new uploads. Refreshing is always manual.

Supported channel links include `/channel/ID`, `/@handle`, `/c/name`, and `/user/name`.

## What it does

- Tracks channels in an Obsidian dashboard.
- Shows the latest eligible video for each channel and how recently its data was retrieved.
- Filters out Shorts when YouTube's feed or page data identifies them as Shorts. This detection is best-effort and may need updates if YouTube changes its pages or feeds.
- Keeps the last available video visible when a refresh fails and explains whether retrying may help.
- Stores channel settings and cached video details in Obsidian's plugin data.

The plugin uses YouTube's public RSS feeds and, when needed, public YouTube pages. It does not require a YouTube account, API key, or separate backend. Video thumbnails are loaded from YouTube.

## Development

```sh
npm install
npm test
npm run build
```

Run `npm run dev` to watch and rebuild while developing.

## License

[MIT](LICENSE)
