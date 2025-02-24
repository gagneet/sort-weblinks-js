import _ from 'lodash';

class CategoryManager {
    constructor(configFile) {
        this.categories = new Map();
        this.keywords = new Map();
        this.configFile = configFile;
    }

    async loadConfig() {
        try {
            const content = await window.fs.readFile(this.configFile, { encoding: 'utf8' });
            const config = JSON.parse(content);
            
            config.categories.forEach(category => {
                this.categories.set(category.name, {
                    description: category.description,
                    tags: category.tags || [],
                    keywords: category.keywords || []
                });
                
                // Index keywords for automatic categorization
                (category.keywords || []).forEach(keyword => {
                    if (!this.keywords.has(keyword)) {
                        this.keywords.set(keyword, []);
                    }
                    this.keywords.get(keyword).push(category.name);
                });
            });
        } catch (error) {
            console.error('Error loading category config:', error);
            throw new Error('Failed to load category configuration');
        }
    }

    suggestCategory(url, title) {
        // Check URL and title against keywords
        const wordsToCheck = [...url.toLowerCase().split(/[/-]/).filter(Boolean),
                             ...title.toLowerCase().split(/\s+/)];
        
        const matchedCategories = new Map();
        
        wordsToCheck.forEach(word => {
            this.keywords.forEach((categories, keyword) => {
                if (word.includes(keyword.toLowerCase())) {
                    categories.forEach(category => {
                        matchedCategories.set(category, (matchedCategories.get(category) || 0) + 1);
                    });
                }
            });
        });
        
        // Return category with most matches, or null if none found
        return Array.from(matchedCategories.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }
}

class URLOrganizer {
    constructor(categoryManager) {
        this.categoryManager = categoryManager;
        this.categories = new Map();
        this.invalidLinks = [];
        this.authLinks = [];
        this.duplicates = [];
        this.stats = {
            total: 0,
            invalid: 0,
            duplicates: 0,
            auth: 0
        };
    }

    async fetchPageTitle(url) {
        try {
            const response = await fetch(url);
            const html = await response.text();
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            return titleMatch ? titleMatch[1].trim() : '';
        } catch (error) {
            console.error('Error fetching page title:', error);
            return '';
        }
    }

    async addNewURL(url, category = null) {
        const title = await this.fetchPageTitle(url);
        const suggestedCategory = category || this.categoryManager.suggestCategory(url, title);
        
        if (!suggestedCategory) {
            throw new Error('Could not determine appropriate category for URL');
        }
        
        this.addURL(suggestedCategory, url, title);
        return { category: suggestedCategory, title };
    }

    async readFile(filename) {
        try {
            const content = await window.fs.readFile(filename, { encoding: 'utf8' });
            return this.parseContent(content);
        } catch (error) {
            console.error('Error reading file:', error);
            return null;
        }
    }

    parseContent(content) {
        let currentCategory = 'Uncategorized';
        const lines = content.split('\n');
        
        lines.forEach(line => {
            // Check if line is a header
            if (line.includes(':') && !line.includes('http')) {
                currentCategory = line.split(':')[0].trim();
                this.categories.set(currentCategory, []);
                return;
            }

            // Extract URLs from line
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urls = line.match(urlRegex);
            
            if (urls) {
                urls.forEach(url => {
                    const description = line.replace(url, '').trim();
                    this.addURL(currentCategory, url, description);
                });
            }
        });
    }

    async validateURL(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return {
                valid: response.ok,
                status: response.status,
                requiresAuth: response.status === 401
            };
        } catch (error) {
            return { valid: false, status: 'error', requiresAuth: false };
        }
    }

    addURL(category, url, description = '') {
        if (this.isDuplicate(url)) {
            this.duplicates.push({ url, category, description });
            this.stats.duplicates++;
            return;
        }

        const urlObj = { url, description };
        
        if (!this.categories.has(category)) {
            this.categories.set(category, []);
        }
        
        this.categories.get(category).push(urlObj);
        this.stats.total++;
    }

    isDuplicate(url) {
        for (const [, urls] of this.categories) {
            if (urls.some(u => u.url === url)) return true;
        }
        return false;
    }

    async validateAllURLs() {
        for (const [category, urls] of this.categories) {
            const validatedUrls = [];
            
            for (const urlObj of urls) {
                const validation = await this.validateURL(urlObj.url);
                
                if (!validation.valid) {
                    if (validation.requiresAuth) {
                        this.authLinks.push({ ...urlObj, category });
                        this.stats.auth++;
                    } else {
                        this.invalidLinks.push({ ...urlObj, category });
                        this.stats.invalid++;
                    }
                } else {
                    validatedUrls.push(urlObj);
                }
            }
            
            this.categories.set(category, validatedUrls);
        }
    }

    generateMarkdown() {
        let markdown = '# URL Directory\n\n';
        
        // Add statistics
        markdown += '## Statistics\n';
        markdown += `- Total Links: ${this.stats.total}\n`;
        markdown += `- Invalid Links: ${this.stats.invalid}\n`;
        markdown += `- Links Requiring Authentication: ${this.stats.auth}\n`;
        markdown += `- Duplicate Links: ${this.stats.duplicates}\n\n`;
        
        // Generate Table of Contents
        markdown += '## Table of Contents\n';
        for (const [category, urls] of this.categories) {
            const validCount = urls.length;
            markdown += `- [${category}](#${category.toLowerCase().replace(/\s+/g, '-')}) (${validCount} links)\n`;
            
            // Add subcategories if more than 16 links
            if (validCount > 16) {
                const subcategories = _.chunk(urls, 16);
                subcategories.forEach((_, index) => {
                    markdown += `  - [Part ${index + 1}](#${category.toLowerCase().replace(/\s+/g, '-')}-part-${index + 1})\n`;
                });
            }
        }
        
        // Add special sections to TOC
        markdown += `- [Links Requiring Authentication](#links-requiring-authentication) (${this.authLinks.length} links)\n`;
        markdown += `- [Invalid Links](#invalid-links) (${this.invalidLinks.length} links)\n`;
        markdown += `- [Duplicate Links](#duplicate-links) (${this.duplicates.length} links)\n\n`;
        
        // Generate content sections
        for (const [category, urls] of this.categories) {
            markdown += `## ${category}\n\n`;
            
            if (urls.length > 16) {
                const subcategories = _.chunk(urls, 16);
                subcategories.forEach((subUrls, index) => {
                    markdown += `### Part ${index + 1}\n\n`;
                    subUrls.forEach(({ url, description }) => {
                        markdown += `- [${description || url}](${url})\n`;
                    });
                    markdown += '\n';
                });
            } else {
                urls.forEach(({ url, description }) => {
                    markdown += `- [${description || url}](${url})\n`;
                });
                markdown += '\n';
            }
        }
        
        // Add special sections
        if (this.authLinks.length > 0) {
            markdown += '## Links Requiring Authentication\n\n';
            this.authLinks.forEach(({ url, description, category }) => {
                markdown += `- [${description || url}](${url}) (from ${category})\n`;
            });
            markdown += '\n';
        }
        
        if (this.invalidLinks.length > 0) {
            markdown += '## Invalid Links\n\n';
            this.invalidLinks.forEach(({ url, description, category }) => {
                markdown += `- [${description || url}](${url}) (from ${category})\n`;
            });
            markdown += '\n';
        }
        
        if (this.duplicates.length > 0) {
            markdown += '## Duplicate Links\n\n';
            this.duplicates.forEach(({ url, description, category }) => {
                markdown += `- [${description || url}](${url}) (from ${category})\n`;
            });
        }
        
        return markdown;
    }

    async processFile(filename) {
        await this.readFile(filename);
        await this.validateAllURLs();
        return this.generateMarkdown();
    }

    async handleInvalidLink(url, alternateUrl) {
        // Remove from invalid links if it exists
        this.invalidLinks = this.invalidLinks.filter(link => link.url !== url);
        
        if (alternateUrl) {
            // Validate the alternate URL
            const validation = await this.validateURL(alternateUrl);
            if (validation.valid) {
                const title = await this.fetchPageTitle(alternateUrl);
                const category = this.categoryManager.suggestCategory(alternateUrl, title);
                if (category) {
                    this.addURL(category, alternateUrl, title);
                    this.stats.invalid--;
                    return { success: true, message: `Added alternate URL to category: ${category}` };
                }
            }
            return { success: false, message: 'Alternate URL is also invalid' };
        }
        return { success: false, message: 'No alternate URL provided' };
    }
}

class CLIHandler {
    constructor() {
        this.organizer = null;
        this.categoryManager = null;
    }

    async initialize(configFile) {
        this.categoryManager = new CategoryManager(configFile);
        await this.categoryManager.loadConfig();
        this.organizer = new URLOrganizer(this.categoryManager);
    }

    async handleCommand(command, args) {
        switch (command) {
            case 'process':
                if (!args.input) {
                    throw new Error('Input file required');
                }
                const markdown = await this.organizer.processFile(args.input);
                await this.saveOutput(markdown, args.output || 'organized-urls.md');
                return 'File processed successfully';

            case 'add':
                if (!args.url) {
                    throw new Error('URL required');
                }
                const result = await this.organizer.addNewURL(args.url, args.category);
                const markdown2 = this.organizer.generateMarkdown();
                await this.saveOutput(markdown2, args.output || 'organized-urls.md');
                return `Added URL to category: ${result.category}`;

            case 'fix-invalid':
                if (!args.url) {
                    throw new Error('Original URL required');
                }
                const fixResult = await this.organizer.handleInvalidLink(args.url, args.alternate);
                if (fixResult.success) {
                    const markdown3 = this.organizer.generateMarkdown();
                    await this.saveOutput(markdown3, args.output || 'organized-urls.md');
                }
                return fixResult.message;

            default:
                throw new Error('Unknown command');
        }
    }

    async saveOutput(content, filename) {
        try {
            await window.fs.writeFile(filename, content, { encoding: 'utf8' });
        } catch (error) {
            console.error('Error saving file:', error);
            throw new Error('Failed to save output file');
        }
    }
}

export { URLOrganizer, CategoryManager, CLIHandler };