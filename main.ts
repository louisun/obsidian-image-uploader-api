import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, requestUrl, Menu } from 'obsidian';
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

// 进度状态接口
interface UploadProgress {
    total: number;
    current: number;
    success: number;
    failed: number;
    skipped: number;
    blacklisted: number;
    errors: Array<{url: string, error: string}>;
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
    progressNotice: Notice | null = null;

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

        // 注册编辑器菜单事件
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
                // 获取当前光标位置
                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);

                // 检查光标是否在图片链接上
                const imageMatch = this.getImageAtCursor(line, cursor.ch);
                if (imageMatch) {
                    menu.addItem((item) => {
                        item
                            .setTitle('上传此图片')
                            .setIcon('upload')
                            .onClick(async () => {
                                await this.uploadSingleImage(editor, imageMatch, cursor.line);
                            });
                    });
                }
            })
        );
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // 更新进度提示
    private updateProgressNotice(progress: UploadProgress) {
        const percent = Math.round((progress.current / progress.total) * 100);
        let message = `处理进度: ${progress.current}/${progress.total} (${percent}%)\n`;
        if (progress.success > 0) message += `✅ 成功: ${progress.success}\n`;
        if (progress.failed > 0) message += `❌ 失败: ${progress.failed}\n`;
        if (progress.skipped > 0) message += `⏭️ 已存在: ${progress.skipped}\n`;
        if (progress.blacklisted > 0) message += `⛔ 黑名单: ${progress.blacklisted}`;
        
        if (!this.progressNotice) {
            this.progressNotice = new Notice(message, 0);
        } else {
            this.progressNotice.setMessage(message);
        }
    }

    // 并发上传图片
    private async uploadImagesConcurrently(editor: Editor, images: Array<{url: string, originalMark: string}>, 
                                         maxConcurrent: number = 3): Promise<{
        newContent: string;
        progress: UploadProgress;
    }> {
        let content = editor.getValue();
        const progress: UploadProgress = {
            total: images.length,
            current: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            blacklisted: 0,
            errors: []
        };

        // 分批处理图片
        for (let i = 0; i < images.length; i += maxConcurrent) {
            const batch = images.slice(i, i + maxConcurrent);
            const promises = batch.map(async ({url, originalMark}) => {
                try {
                    // 检查黑名单
                    if (this.isUrlBlacklisted(url)) {
                        progress.blacklisted++;
                        progress.current++;
                        this.updateProgressNotice(progress);
                        return { originalMark, newMark: originalMark };
                    }

                    // 检查是否已上传
                    if (url.startsWith(new URL(this.settings.apiUrl).origin)) {
                        progress.skipped++;
                        progress.current++;
                        this.updateProgressNotice(progress);
                        return { originalMark, newMark: originalMark };
                    }

                    // 下载图片
                    const response = await requestUrl({
                        url: url,
                        method: "GET",
                        headers: {
                            'Accept': 'image/*'
                        }
                    });

                    if (response.status !== 200) {
                        throw new Error(`下载失败: HTTP ${response.status}`);
                    }

                    // 处理文件
                    const fileName = this.getUrlFileName(url);
                    const mimeType = response.headers["content-type"] || this.getMimeType(url);
                    const file = new File([response.arrayBuffer], fileName, { type: mimeType });

                    // 上传图片
                    const newUrl = await this.uploadImage(file);
                    
                    if (newUrl) {
                        progress.success++;
                        const newMark = originalMark.replace(url, newUrl);
                        console.log(`✅ 成功: ${url} -> ${newUrl}`);
                        return { originalMark, newMark };
                    } else {
                        throw new Error("上传返回的URL为空");
                    }
                } catch (error) {
                    progress.failed++;
                    progress.errors.push({
                        url: url,
                        error: error.message || "未知错误"
                    });
                    console.error(`❌ 失败: ${url}`, error);
                    return { originalMark, newMark: originalMark };
                } finally {
                    progress.current++;
                    this.updateProgressNotice(progress);
                }
            });

            // 等待当前批次完成
            const results = await Promise.all(promises);
            
            // 更新内容
            results.forEach(({originalMark, newMark}) => {
                content = content.replace(originalMark, newMark);
            });
        }

        return { newContent: content, progress };
    }

    async uploadAllImages(editor: Editor) {
        const content = editor.getValue();
        const imageRegex = /!\[.*?\]\((.*?)\)/g;
        const matches = Array.from(content.matchAll(imageRegex));

        if (matches.length === 0) {
            new Notice('没有找到需要上传的图片');
            return;
        }

        // 准备图片数组
        const images = matches.map(match => ({
            url: match[1],
            originalMark: match[0]
        }));

        // 开始上传提示
        new Notice(`开始处理 ${images.length} 张图片...`);
        
        try {
            // 并发上传图片
            const { newContent, progress } = await this.uploadImagesConcurrently(editor, images);
            
            // 更新编辑器内容
            if (progress.success > 0) {
                editor.setValue(newContent);
            }

            // 清除进度提示
            if (this.progressNotice) {
                this.progressNotice.hide();
                this.progressNotice = null;
            }

            // 显示最终结果
            let finalMessage = '处理完成:\n';
            if (progress.success > 0) finalMessage += `✅ ${progress.success} 个成功\n`;
            if (progress.failed > 0) {
                finalMessage += `❌ ${progress.failed} 个失败\n`;
                // 显示详细错误信息
                progress.errors.forEach(({url, error}) => {
                    finalMessage += `  • ${url.substring(0, 20)}... : ${error}\n`;
                });
            }
            if (progress.skipped > 0) finalMessage += `⏭️ ${progress.skipped} 个已存在\n`;
            if (progress.blacklisted > 0) finalMessage += `⛔ ${progress.blacklisted} 个在黑名单中`;

            new Notice(finalMessage, 10000); // 显示10秒
        } catch (error) {
            new Notice(`处理过程出错: ${error.message}`);
            console.error('处理过程出错:', error);
        }
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
            new Notice('上传失败: ' + error.message);
        }
    }

    // Upload image
    async uploadImage(file: File): Promise<string> {
        try {
            // 检查API URL是否是默认值
            if (this.settings.apiUrl === 'http://your-api.com/upload') {
                new Notice('请在设置中配置正确的图片上传API地址');
                throw new Error('未配置API地址');
            }

            console.log(`上传图片类型: ${file.type}, 文件名: ${file.name}, 大小: ${file.size} 字节`);
            
            // 创建FormData
            const formData = new FormData();
            formData.append('image', file);

            // 发送请求
            const response = await fetch(this.settings.apiUrl, {
                method: this.settings.method,
                body: formData,
                headers: this.settings.customHeaders.reduce((acc, header) => {
                    const [key, value] = header.split(':').map(s => s.trim());
                    if (key && value) acc[key] = value;
                    return acc;
                }, {} as Record<string, string>)
            });

            if (!response.ok) {
                throw new Error(`HTTP错误! 状态码: ${response.status}`);
            }

            const result = await response.json();
            return result.data.url;
        } catch (error) {
            console.error("上传错误:", error);
            throw error;
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
                if (width > 1600) resolve(this.settings.defaultWidthLarge);
                else if (width > 1200) resolve(this.settings.defaultWidthMedium);
                else if (width > 800) resolve(this.settings.defaultWidthSmall);
                else resolve(width);
            };
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(file);
        });
    }

    // Check if URL is blacklisted
    isUrlBlacklisted(url: string): boolean {
        try {
            const urlLower = url.toLowerCase();
            return this.settings.blacklistDomains.some(domain => {
                const domainLower = domain.toLowerCase().trim();
                const urlWithoutProtocol = urlLower.replace(/^https?:\/\//, '');
                const domainWithoutProtocol = domainLower.replace(/^https?:\/\//, '');
                return urlWithoutProtocol.startsWith(domainWithoutProtocol);
            });
        } catch {
            return false;
        }
    }

    // 从URL中提取文件名
    private getUrlFileName(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const fileName = pathname.substring(pathname.lastIndexOf('/') + 1);
            return fileName || 'image.jpg';
        } catch {
            return 'image.jpg';
        }
    }

    // 根据文件扩展名获取MIME类型
    private getMimeType(url: string): string {
        const ext = url.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp'
        };
        return mimeTypes[ext || ''] || 'image/jpeg';
    }

    // 获取光标位置的图片信息
    private getImageAtCursor(line: string, cursorCh: number): { url: string, originalMark: string } | null {
        const imageRegex = /!\[.*?\]\((.*?)\)/g;
        let match;

        while ((match = imageRegex.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            
            // 检查光标是否在图片标记内
            if (cursorCh >= start && cursorCh <= end) {
                return {
                    url: match[1],
                    originalMark: match[0]
                };
            }
        }

        return null;
    }

    // 上传单个图片
    private async uploadSingleImage(editor: Editor, image: { url: string, originalMark: string }, line: number) {
        try {
            // 检查是否在黑名单中
            if (this.isUrlBlacklisted(image.url)) {
                new Notice('此图片域名在黑名单中');
                return;
            }

            // 检查是否已经是上传后的地址
            if (image.url.startsWith(new URL(this.settings.apiUrl).origin)) {
                new Notice('此图片已经上传过了');
                return;
            }

            new Notice('开始上传图片...');

            // 下载图片
            const response = await requestUrl({
                url: image.url,
                method: "GET",
                headers: {
                    'Accept': 'image/*'
                }
            });

            if (response.status !== 200) {
                throw new Error(`下载失败: HTTP ${response.status}`);
            }

            // 处理文件
            const fileName = this.getUrlFileName(image.url);
            const mimeType = response.headers["content-type"] || this.getMimeType(image.url);
            const file = new File([response.arrayBuffer], fileName, { type: mimeType });

            // 上传图片
            const newUrl = await this.uploadImage(file);
            
            if (newUrl) {
                // 保存当前光标位置
                const cursor = editor.getCursor();
                
                // 替换当前行中的图片链接
                const newMark = image.originalMark.replace(image.url, newUrl);
                const currentLine = editor.getLine(line);
                const newLine = currentLine.replace(image.originalMark, newMark);
                
                // 只替换当前行的内容
                const from = { line: line, ch: 0 };
                const to = { line: line, ch: currentLine.length };
                editor.replaceRange(newLine, from, to);
                
                // 恢复光标位置
                editor.setCursor(cursor);

                new Notice('✅ 上传成功');
                console.log(`✅ 成功: ${image.url} -> ${newUrl}`);
            }
        } catch (error) {
            console.error('❌ 上传失败:', error);
            new Notice(`❌ 上传失败: ${error.message}`);
        }
    }
} 