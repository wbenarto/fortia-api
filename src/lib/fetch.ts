import React from 'react';

// Get the base URL from environment variables
const getBaseURL = () => {
  const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || process.env.VERCEL_URL;

  if (!serverURL) {
    console.warn('NEXT_PUBLIC_SERVER_URL not set, using development fallback');
    return 'http://localhost:3000'; // Development fallback
  }

  // Ensure HTTPS for production
  const baseURL = serverURL.startsWith('http') ? serverURL : `https://${serverURL}`;
  return baseURL.replace(/\/$/, ''); // Remove trailing slash
};

export const fetchAPI = async (endpoint: string, options?: RequestInit) => {
  try {
    const baseURL = getBaseURL();
    const url = `${baseURL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    // Only log endpoint for debugging, not full URL or request details

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    // Only log status code, not headers or response data

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      const errorText = await response.text();
      // Don't log full error response body as it might contain sensitive data
      console.error(`Error response length: ${errorText.length} characters`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    // Don't log response data as it might contain sensitive information
    return data;
  } catch (error) {
    console.error('Fetch error:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};

// React hook for API calls (for client-side usage)
export const useFetch = <T>(endpoint: string, options?: RequestInit) => {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAPI(endpoint, options);
      setData(result.data);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, options]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};

// Server-side fetch utility for API routes
export const serverFetch = async (endpoint: string, options?: RequestInit) => {
  try {
    const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const url = `${baseURL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    // Only log endpoint, not full URL

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      console.error(`Server fetch error! status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Server fetch error:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}; 