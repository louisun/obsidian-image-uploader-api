import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { ImageUploaderSettingTab } from './settings';

interface ImageUploaderSettings {
    apiUrl: string;
    method: string;
    jsonPath: string;
    blacklistDomains: string[];
    autoUploadOnPaste: boolean;
    customHeaders: string[];
    defaultWidthLarge: number;
    defaultWidthMedium: number;
    defaultWidthSmall: number;
    enableAutoWidth: boolean;
}

const DEFAULT_SETTINGS: ImageUploaderSettings = {
    apiUrl: 'http://your-api.com/upload',
    method: 'POST',
    jsonPath: 'data.url',
    blacklistDomains: [],
    autoUploadOnPaste: true,
    customHeaders: [],
    defaultWidthLarge: 800,
    defaultWidthMedium: 600,
    defaultWidthSmall: 400,
    enableAutoWidth: true
}

export default class ImageUploaderPlugin extends Plugin {
    settings: ImageUploaderSettings;

    async onload() {
        await this.loadSettings();

        // Register settings tab
        this.addSettingTab(new ImageUploaderSettingTab(this.app, this));

        // Register paste event handler
        this.registerEvent(
            this.app.workspace.on('editor-paste', this.handlePaste.bind(this))
        );

        // Add command to upload all images
        this.addCommand({
            id: 'upload-all-images',
            name: 'Upload all images in current file',
            editorCallback: (editor: Editor) => this.uploadAllImages(editor),
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "u" }]
        });

        // Add reload command for development
        this.addCommand({
            id: 'reload-plugin',
            name: 'Reload plugin (dev)',
            callback: () => {
                // @ts-ignore
                this.app.plugins.disablePlugin(this.manifest.id).then(() => {
                    // @ts-ignore
                    this.app.plugins.enablePlugin(this.manifest.id);
                })
            },
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "r" }]
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Handle paste event
    async handlePaste(evt: ClipboardEvent, editor: Editor) {
        const files = evt.clipboardData?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (!file.type.startsWith('image')) return;

        // Check if auto upload is enabled
        if (!this.settings.autoUploadOnPaste) {
            return;
        }

        evt.preventDefault();

        try {
            const url = await this.uploadImage(file);
            if (url) {
                let markdownImage = `![](${url})`;
                if (this.settings.enableAutoWidth) {
                    const width = await this.getDefaultWidth(file);
                    if (width) {
                        markdownImage = `![|${width}](${url})`;
                    }
                }
                editor.replaceSelection(markdownImage);
            }
        } catch (error) {
            new Notice('Failed to upload image: ' + error.message);
        }
    }

    // Upload image
    async uploadImage(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('image', file);

        // Process custom headers
        const headers: Record<string, string> = {
            'Accept': 'application/json'
        };
        
        // Add custom headers
        this.settings.customHeaders.forEach(header => {
            const [key, ...values] = header.split(':');
            if (key && values.length > 0) {
                headers[key.trim()] = values.join(':').trim();
            }
        });

        const response = await fetch(this.settings.apiUrl, {
            method: this.settings.method,
            body: formData,
            headers,
            mode: 'cors',
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const json = await response.json();
        return this.getValueByPath(json, this.settings.jsonPath);
    }

    // Parse JSON path
    getValueByPath(obj: any, path: string): string {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    // Check if URL is blacklisted
    isUrlBlacklisted(url: string): boolean {
        try {
            // Convert to lowercase for comparison
            const urlLower = url.toLowerCase();
            return this.settings.blacklistDomains.some(domain => {
                const domainLower = domain.toLowerCase().trim();
                // Remove possible protocol prefix
                const urlWithoutProtocol = urlLower.replace(/^https?:\/\//, '');
                const domainWithoutProtocol = domainLower.replace(/^https?:\/\//, '');
                // Check if domain matches (considering port)
                return urlWithoutProtocol.startsWith(domainWithoutProtocol);
            });
        } catch {
            return false;
        }
    }

    // Upload all images
    async uploadAllImages(editor: Editor) {
        const content = editor.getValue();
        const imageRegex = /!\[.*?\]\((.*?)\)/g;
        const matches = Array.from(content.matchAll(imageRegex));

        if (matches.length === 0) {
            new Notice('No images found in current file');
            return;
        }

        let uploadCount = 0;
        let failCount = 0;
        let skippedCount = 0;
        let blacklistedCount = 0;
        let newContent = content;

        new Notice('Starting to upload images...');

        for (const match of matches) {
            const imageUrl = match[1];
            console.log('Processing URL:', imageUrl);

            if (this.isUrlBlacklisted(imageUrl)) {
                blacklistedCount++;
                console.log('Skipped blacklisted URL:', imageUrl);
                continue;
            }

            // Check if URL is already an uploaded address
            if (imageUrl.startsWith(new URL(this.settings.apiUrl).origin)) {
                skippedCount++;
                console.log('Skipped already uploaded URL:', imageUrl);
                continue;
            }

            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                const file = new File([blob], 'image.png', { type: blob.type });
                const newUrl = await this.uploadImage(file);
                
                if (newUrl) {
                    newContent = newContent.replace(imageUrl, newUrl);
                    uploadCount++;
                    console.log('Replaced URL:', imageUrl, 'with:', newUrl);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                failCount++;
                console.error('Upload failed:', error);
                new Notice(`Failed to upload image: ${imageUrl}`);
            }
        }

        if (uploadCount > 0) {
            editor.setValue(newContent);
        }

        // Build complete status message
        let message = [];
        if (uploadCount > 0) message.push(`${uploadCount} succeeded`);
        if (failCount > 0) message.push(`${failCount} failed`);
        if (skippedCount > 0) message.push(`${skippedCount} already uploaded`);
        if (blacklistedCount > 0) message.push(`${blacklistedCount} blacklisted`);

        if (message.length === 0) {
            if (blacklistedCount === matches.length) {
                new Notice('All images are in blacklist, nothing to upload');
            } else if (skippedCount === matches.length) {
                new Notice('All images are already uploaded');
            } else {
                new Notice('No images were processed');
            }
        } else {
            new Notice(`Upload complete: ${message.join(', ')}`);
        }
    }

    // Get default width
    async getDefaultWidth(file: File): Promise<number | null> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                const width = img.width;
                // Return different default values based on actual image width
                if (width > 1600) resolve(800);
                else if (width > 1200) resolve(600);
                else if (width > 800) resolve(400);
                else resolve(width);
            };
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(file);
        });
    }
} 