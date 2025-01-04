import { App, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
import ImageUploaderPlugin from './main';

export class ImageUploaderSettingTab extends PluginSettingTab {
    plugin: ImageUploaderPlugin;

    constructor(app: App, plugin: ImageUploaderPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Add main heading with emoji
        const title = containerEl.createEl('h2', { 
            text: '️🔄 Image Uploader API Settings',
            cls: 'image-uploader-title'
        });

        // API Settings Section
        containerEl.createEl('h3', { text: 'API Configuration' });

        new Setting(containerEl)
            .setName('API URL')
            .setDesc('Set the API endpoint for image upload')
            .addText(text => text
                .setPlaceholder('Enter API URL')
                .setValue(this.plugin.settings.apiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Request Method')
            .setDesc('Set the API request method')
            .addDropdown(dropdown => dropdown
                .addOption('POST', 'POST')
                .addOption('PUT', 'PUT')
                .setValue(this.plugin.settings.method)
                .onChange(async (value) => {
                    this.plugin.settings.method = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('JSON Path')
            .setDesc('Set the JSON path for the returned URL')
            .addText(text => text
                .setPlaceholder('e.g., data.url')
                .setValue(this.plugin.settings.jsonPath)
                .onChange(async (value) => {
                    this.plugin.settings.jsonPath = value;
                    await this.plugin.saveSettings();
                }));

        // Upload Settings Section
        containerEl.createEl('h3', { text: 'Upload Settings' });

        new Setting(containerEl)
            .setName('Auto Upload on Paste')
            .setDesc('Automatically upload images when pasting')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoUploadOnPaste)
                .onChange(async (value) => {
                    this.plugin.settings.autoUploadOnPaste = value;
                    await this.plugin.saveSettings();
                }));

        // Image Width Settings
        const widthDesc = containerEl.createDiv();
        widthDesc.createEl('p', {
            text: 'Automatically set display width for pasted images based on their original size.',
            cls: 'width-settings-desc'
        });

        new Setting(containerEl)
            .setName('Enable Auto Width')
            .setDesc('Add width syntax to pasted images')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoWidth ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoWidth = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Large Image Width')
            .setDesc('Display width for images larger than 1600px')
            .addText(text => text
                .setPlaceholder('800')
                .setValue(this.plugin.settings.defaultWidthLarge?.toString() || '800')
                .then(textEl => {
                    textEl.inputEl.style.width = '80px';
                    textEl.inputEl.type = 'number';
                })
                .onChange(async (value) => {
                    this.plugin.settings.defaultWidthLarge = parseInt(value) || 800;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Medium Image Width')
            .setDesc('Display width for images between 1200-1600px')
            .addText(text => text
                .setPlaceholder('600')
                .setValue(this.plugin.settings.defaultWidthMedium?.toString() || '600')
                .then(textEl => {
                    textEl.inputEl.style.width = '80px';
                    textEl.inputEl.type = 'number';
                })
                .onChange(async (value) => {
                    this.plugin.settings.defaultWidthMedium = parseInt(value) || 600;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Small Image Width')
            .setDesc('Display width for images between 800-1200px')
            .addText(text => text
                .setPlaceholder('400')
                .setValue(this.plugin.settings.defaultWidthSmall?.toString() || '400')
                .then(textEl => {
                    textEl.inputEl.style.width = '80px';
                    textEl.inputEl.type = 'number';
                })
                .onChange(async (value) => {
                    this.plugin.settings.defaultWidthSmall = parseInt(value) || 400;
                    await this.plugin.saveSettings();
                }));

        // Custom Headers Section with textarea below
        const headersContainer = containerEl.createDiv('headers-container');
        new Setting(headersContainer)
            .setName('Custom Headers')
            .setDesc('Add custom HTTP headers for API requests (one per line, format: Key: Value)');

        const headersTextArea = new Setting(headersContainer)
            .addTextArea(text => text
                .setPlaceholder('Authorization: Bearer token\nX-Custom-Header: value')
                .setValue(this.plugin.settings.customHeaders?.join('\n') || '')
                .onChange(async (value) => {
                    this.plugin.settings.customHeaders = value
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.includes(':'));
                    await this.plugin.saveSettings();
                }));

        // Style the headers textarea
        const headersComponent = headersTextArea.components[0] as TextAreaComponent;
        headersComponent.inputEl.style.width = '100%';
        headersComponent.inputEl.style.height = '80px';
        headersTextArea.settingEl.style.border = 'none';
        headersTextArea.settingEl.style.padding = '0';

        // Blacklist Section
        containerEl.createEl('h3', { text: 'Domain Blacklist' });

        // Domain Blacklist setting
        const blacklistContainer = containerEl.createDiv('blacklist-container');

        new Setting(blacklistContainer)
            .setName('Domain Blacklist')
            .setDesc('Specify domains that should not be uploaded (one per line).');

        // Add textarea in a new div below the setting
        const textAreaContainer = blacklistContainer.createDiv('blacklist-textarea-container');
        const textArea = new Setting(textAreaContainer)
            .addTextArea(text => text
                .setPlaceholder('Examples:\nexample.com\nlocalhost:3000\nhttp://test.com')
                .setValue(this.plugin.settings.blacklistDomains.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.blacklistDomains = value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    await this.plugin.saveSettings();
                }));

        // Style the textarea
        const textAreaComponent = textArea.components[0] as TextAreaComponent;
        textAreaComponent.inputEl.style.width = '100%';
        textAreaComponent.inputEl.style.height = '120px';
        textAreaComponent.inputEl.style.minHeight = '120px';

        // Remove default setting styles
        textArea.settingEl.style.border = 'none';
        textArea.settingEl.style.padding = '0';
    }
} 