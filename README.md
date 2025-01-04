# Obsidian Image Uploader API

An Obsidian plugin that automatically uploads images to your custom API endpoint when pasting or processing existing images in your notes.

## Features

- 🚀 Auto-upload images on paste
- 🔄 Upload all images in current file with one command
- ⚙️ Configurable API endpoint and request method
- 📝 Custom HTTP headers support
- 🎯 Smart image width settings based on original size
- 🚫 Domain blacklist to prevent specific images from being uploaded
- ⌨️ Keyboard shortcuts support

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/louisun/obsidian-image-uploader-api.git

# Install dependencies
npm install

# Build the plugin
npm run build

# Copy to your vault
make install  # Requires setting VAULT_PATH in .env.local
```

## Configuration

1. Set your API endpoint URL
2. Configure the HTTP method (POST/PUT)
3. Set the JSON path for the returned URL (default: `data.url`)
4. Add any required custom headers
5. Configure image width rules (optional)
   - Large images (>1600px): default 800px
   - Medium images (1200-1600px): default 600px
   - Small images (800-1200px): default 400px
6. Add domain blacklist patterns (optional)

## API Response Format

Your API endpoint should return a JSON response in this format:

```json
{
    "code": 0,
    "data": {
        "url": "http://your-domain.com/path/to/image.png"
    },
    "msg": "success"
}
```

## Usage

### Keyboard Shortcuts

- `Ctrl/Cmd + Shift + U`: Upload all images in current file
- `Ctrl/Cmd + Shift + R`: Reload plugin (development only)

### Auto Upload

Images pasted from clipboard will be automatically uploaded to your configured API endpoint. The plugin will:
1. Convert the image to a file
2. Send it to your API
3. Replace the pasted content with a markdown image link using the returned URL

### Domain Blacklist

Add domains to prevent specific images from being uploaded:
```
example.com
localhost:3000
api.yourdomain.com
```

### Image Width Control

The plugin can automatically set display widths for images based on their original size using Obsidian's image width syntax: `![|width](url)`

## Development

```bash
# Install dependencies
npm install

# Start development build
npm run dev

# Create production build
npm run build

# Install to your vault (configure VAULT_PATH in .env.local first)
make install
```

### Environment Setup

1. Copy `.env.local.example` to `.env.local`
2. Set your Obsidian vault path:

```bash
VAULT_PATH=/path/to/your/vault
```

## License

[MIT License](LICENSE)

## Support

If you encounter any issues or have suggestions, please:
1. Check the plugin settings are correctly configured
2. Ensure your API endpoint is accessible and returns the expected format
3. Check the console for any error messages (Ctrl/Cmd + Shift + I)