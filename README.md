# Sorting of favourites/web URL's using JavaScript code

## Running the CLI

### Process an input file
node url-organizer.js process --input links.txt --config categories.json --output organized.md

### Add a new URL
node url-organizer.js add --url https://example.com --category DevOps

### Fix an invalid link
node url-organizer.js fix-invalid --url https://old-invalid.com --alternate https://new-valid.com

## Key Features

- Reads and parses text files containing URLs and their categories
- Validates URLs and checks their accessibility
- Categorizes URLs with automatic subcategory creation for groups > 16 links
- Generates a markdown file with table of contents and statistics
- Tracks invalid, authentication-required, and duplicate links

## To use the organizer

```javascript
javascriptCopyconst organizer = new URLOrganizer();
const markdown = await organizer.processFile('your-input-file.txt');
```

## File Maintenance

- The generated markdown file maintains counts in both TOC and statistics section
- To add new links, you can either:
a. Update the original text file and reprocess it
b. Manually add links to the markdown file and update the counts in the statistics section

## The output markdown file will include

- Statistics section with total counts
- Table of contents with link counts per category
- Categorized links with descriptions
- Special sections for invalid, auth-required, and duplicate links


## Category Management

- Custom category configuration file with tags and keywords
- Automatic category suggestion based on URL and page title
- Hierarchical category organization


## CLI Capabilities

- Process entire files
- Add individual URLs with automatic title fetching
- Handle invalid links with alternatives
- Specify input/output files and category config

## Enhanced URL Processing

- Automatic page title fetching
- Smarter category matching
- Invalid link management

## Category Configuration

- Define categories with descriptions
- Add relevant tags and keywords
- System uses these to automatically categorize new URLs

## File Maintenance:

- All changes automatically update statistics
- Category configuration can be updated separately
- Invalid links can be managed incrementally
