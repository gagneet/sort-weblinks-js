import _ from 'lodash';

class URLOrganizer {
    constructor() {
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
}

export default URLOrganizer;