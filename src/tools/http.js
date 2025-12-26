/**
 * HTTP Testing Tools
 * API testing and HTTP request utilities
 */

/**
 * Tool Definitions
 */
export const definitions = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to test APIs. Supports GET, POST, PUT, DELETE, PATCH methods.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to request',
        },
        method: {
          type: 'string',
          description: 'HTTP method: GET, POST, PUT, DELETE, PATCH (default: GET)',
        },
        headers: {
          type: 'object',
          description: 'Request headers as key-value pairs',
        },
        body: {
          type: 'string',
          description: 'Request body (for POST/PUT/PATCH)',
        },
        json: {
          type: 'object',
          description: 'JSON body (will be stringified and Content-Type set)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'http_check',
    description: 'Check if a URL is reachable and get basic info (status, response time).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to check',
        },
        timeout: {
          type: 'integer',
          description: 'Timeout in milliseconds (default: 10000)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'http_headers',
    description: 'Get HTTP response headers from a URL (useful for checking security headers).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to check headers',
        },
      },
      required: ['url'],
    },
  },
];

/**
 * Execute tool
 */
export async function execute(name, args) {
  switch (name) {
    case 'http_request': {
      const method = (args.method || 'GET').toUpperCase();
      const headers = args.headers || {};
      
      // Handle JSON body
      let body = args.body;
      if (args.json) {
        body = JSON.stringify(args.json);
        headers['Content-Type'] = 'application/json';
      }

      const startTime = Date.now();
      
      try {
        const response = await fetch(args.url, {
          method,
          headers,
          body: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
          signal: AbortSignal.timeout(30000),
        });

        const responseTime = Date.now() - startTime;
        
        // Try to get response body
        let responseBody;
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          try {
            responseBody = await response.json();
          } catch {
            responseBody = await response.text();
          }
        } else {
          responseBody = await response.text();
          // Truncate large text responses
          if (responseBody.length > 2000) {
            responseBody = responseBody.slice(0, 2000) + '\n...[truncated]';
          }
        }

        return {
          success: true,
          status: response.status,
          statusText: response.statusText,
          responseTime: `${responseTime}ms`,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }

    case 'http_check': {
      const timeout = args.timeout || 10000;
      const startTime = Date.now();

      try {
        const response = await fetch(args.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(timeout),
        });

        const responseTime = Date.now() - startTime;

        return {
          success: true,
          url: args.url,
          reachable: true,
          status: response.status,
          statusText: response.statusText,
          responseTime: `${responseTime}ms`,
        };
      } catch (error) {
        return {
          success: false,
          url: args.url,
          reachable: false,
          error: error.message,
        };
      }
    }

    case 'http_headers': {
      try {
        const response = await fetch(args.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(10000),
        });

        const headers = Object.fromEntries(response.headers.entries());
        
        // Check for security headers
        const securityHeaders = {
          'strict-transport-security': headers['strict-transport-security'] || '❌ Missing',
          'content-security-policy': headers['content-security-policy'] || '❌ Missing',
          'x-frame-options': headers['x-frame-options'] || '❌ Missing',
          'x-content-type-options': headers['x-content-type-options'] || '❌ Missing',
          'x-xss-protection': headers['x-xss-protection'] || '❌ Missing',
        };

        return {
          success: true,
          url: args.url,
          status: response.status,
          allHeaders: headers,
          securityHeaders,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    }

    default:
      return { error: `Unknown HTTP tool: ${name}` };
  }
}

export default { definitions, execute };
