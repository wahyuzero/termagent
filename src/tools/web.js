/**
 * Web Search Tool using DuckDuckGo Instant Answer API
 * No API key required!
 */

/**
 * Tool Definitions
 */
export const definitions = [
  {
    name: 'web_search',
    description: 'Search the web for current information, documentation, or code examples. Useful when you need up-to-date information or external references.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        maxResults: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 5, max: 10)',
        },
      },
      required: ['query'],
    },
  },
];

/**
 * DuckDuckGo Instant Answer API
 * Free, no API key required
 */
async function searchDuckDuckGo(query, maxResults = 5) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const data = await response.json();
    const results = [];
    
    // Add abstract if exists
    if (data.Abstract) {
      results.push({
        title: data.Heading || 'Summary',
        snippet: data.Abstract,
        url: data.AbstractURL || '',
        source: data.AbstractSource || 'DuckDuckGo',
      });
    }
    
    // Add related topics
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
        if (topic.Text && !topic.Topics) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related',
            snippet: topic.Text,
            url: topic.FirstURL || '',
            source: 'DuckDuckGo',
          });
        }
      }
    }
    
    // Add answer if exists (for direct answers)
    if (data.Answer) {
      results.unshift({
        title: 'Direct Answer',
        snippet: data.Answer,
        url: '',
        source: 'DuckDuckGo',
      });
    }
    
    return results.slice(0, maxResults);
  } catch (error) {
    throw new Error(`Web search failed: ${error.message}`);
  }
}

/**
 * Fallback: Use HTML scraping if API doesn't return good results
 */
async function searchDuckDuckGoHtml(query, maxResults = 5) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const html = await response.text();
    const results = [];
    
    // More flexible regex patterns
    // Match result links
    const linkRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</gi;
    // Match snippets
    const snippetRegex = /class="result__snippet"[^>]*>([^<]+)</gi;
    
    const links = [];
    const snippets = [];
    
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push({ url: match[1], title: match[2].trim() });
    }
    
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(match[1].trim());
    }
    
    // Combine links with snippets
    for (let i = 0; i < Math.min(links.length, maxResults); i++) {
      results.push({
        title: links[i].title,
        snippet: snippets[i] || 'No description available',
        url: links[i].url,
        source: 'DuckDuckGo',
      });
    }
    
    return results;
  } catch (error) {
    // Return empty array instead of throwing, let caller handle
    console.error('Web search error:', error.message);
    return [];
  }
}

/**
 * Execute search
 */
async function webSearch({ query, maxResults = 5 }) {
  const limit = Math.min(maxResults, 10);
  
  // Try instant answer API first
  let results = await searchDuckDuckGo(query, limit);
  
  // If no results, try HTML scraping
  if (results.length === 0) {
    results = await searchDuckDuckGoHtml(query, limit);
  }
  
  if (results.length === 0) {
    return {
      success: true,
      query,
      results: [],
      message: 'No results found',
    };
  }
  
  return {
    success: true,
    query,
    results,
    total: results.length,
  };
}

/**
 * Execute tool
 */
export async function execute(name, args) {
  switch (name) {
    case 'web_search':
      return await webSearch(args);
    default:
      return { error: `Unknown web tool: ${name}` };
  }
}

export default { definitions, execute };
