import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  accessToken: string | null;
  handleAuthCallback?: (code: string, state: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// OAuth2.0 Configuration from environment variables
const envRecord = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const OAUTH_CONFIG = {
  authUrl: envRecord.VITE_OAUTH_AUTH_URL ?? '',
  tokenUrl: envRecord.VITE_OAUTH_TOKEN_URL ?? '',
  clientId: envRecord.VITE_OAUTH_CLIENT_ID ?? '',
  clientSecret: envRecord.VITE_OAUTH_CLIENT_SECRET ?? '',
  scopes: envRecord.VITE_OAUTH_SCOPES ?? '',
  redirectUri: envRecord.VITE_OAUTH_REDIRECT_URI ?? '',
};

// PKCE helpers
async function sha256(input: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateCodeVerifier(): string {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  return base64UrlEncode(random); // 43 chars, within 43-128 spec
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Check for existing tokens on mount
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const tokenExpiry = localStorage.getItem('token_expiry');
    
    if (token && tokenExpiry) {
      const expiryTime = parseInt(tokenExpiry, 10);
      if (Date.now() < expiryTime) {
        setAccessToken(token);
        setIsAuthenticated(true);
      } else {
        // Token expired, clear it
        localStorage.removeItem('access_token');
        localStorage.removeItem('id_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('token_expiry');
      }
    }
    setIsLoading(false);
  }, []);

  const login = () => {
    // Prevent duplicate login attempts from creating multiple redirects
    try { sessionStorage.setItem('isLoggingIn', '1'); } catch (e) { /* ignore */ }

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('oauth_state', state);

    // Redirect to Cognito authorization endpoint with PKCE
    (async () => {
      // Enforce use of VITE_OAUTH_REDIRECT_URI only
      if (!OAUTH_CONFIG.redirectUri) {
        console.error('VITE_OAUTH_REDIRECT_URI is not set. Aborting login to avoid using a default redirect URI.');
        try { sessionStorage.removeItem('isLoggingIn'); } catch (e) { /* ignore */ }
        return;
      }
      // Prepare PKCE values
      const verifier = generateCodeVerifier();
      try { sessionStorage.setItem('pkce_verifier', verifier); } catch (e) { console.warn('Unable to store pkce_verifier', e); }
      const challenge = base64UrlEncode(await sha256(verifier));

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: OAUTH_CONFIG.clientId,
        redirect_uri: OAUTH_CONFIG.redirectUri,
        scope: OAUTH_CONFIG.scopes,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });

      const authUrl = `${OAUTH_CONFIG.authUrl}?${params.toString()}`;
      console.log('Redirecting to authorize with PKCE');
      // Navigate to hosted UI (will unload this page)
      window.location.href = authUrl;
    })();
  };

  const logout = () => {
    // Mark just-logged-out to suppress auto-login in ProtectedRoute during this navigation
    try { sessionStorage.setItem('justLoggedOut', '1'); } catch (e) { /* ignore */ }

    // Clear in-memory state
    setAccessToken(null);
    setIsAuthenticated(false);

    // Clear tokens and auth artifacts from storage
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('id_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('token_expiry');
      localStorage.removeItem('oauth_state');
      sessionStorage.removeItem('pkce_verifier');
    } catch {
      // Ignore storage errors (private mode, etc.)
    }

    // Use VITE_OAUTH_LOGOUT_URL and VITE_OAUTH_LOGOUT_REDIRECT directly from env
    if (!envRecord.VITE_OAUTH_LOGOUT_URL || !envRecord.VITE_OAUTH_LOGOUT_REDIRECT) {
      console.error('Missing required environment variables for logout: VITE_OAUTH_LOGOUT_URL or VITE_OAUTH_LOGOUT_REDIRECT');
      return;
    }

    const logoutUrl = `${envRecord.VITE_OAUTH_LOGOUT_URL}?client_id=${encodeURIComponent(OAUTH_CONFIG.clientId)}&logout_uri=${encodeURIComponent(envRecord.VITE_OAUTH_LOGOUT_REDIRECT)}`;

    window.location.replace(logoutUrl);
  };

  const handleAuthCallback = async (code: string, state: string) => {
    // Verify state to prevent CSRF
    const savedState = localStorage.getItem('oauth_state');
    if (state !== savedState) {
      console.error('State mismatch - possible CSRF attack');
      // clear logging flag so user can retry
      try { sessionStorage.removeItem('isLoggingIn'); } catch (e) { /* ignore */ }
      return false;
    }
    localStorage.removeItem('oauth_state');

    let success = false;
    try {
      // Exchange authorization code for tokens
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: OAUTH_CONFIG.clientId,
        code,
        redirect_uri: OAUTH_CONFIG.redirectUri,
      });

      // Include PKCE code_verifier if present
      try {
        const verifier = sessionStorage.getItem('pkce_verifier');
        if (verifier) {
          tokenParams.set('code_verifier', verifier);
          sessionStorage.removeItem('pkce_verifier');
        }
      } catch (e) {
        console.warn('PKCE verifier not available:', e);
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      if (OAUTH_CONFIG.clientSecret) {
        const credentials = btoa(`${OAUTH_CONFIG.clientId}:${OAUTH_CONFIG.clientSecret}`);
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const response = await fetch(OAUTH_CONFIG.tokenUrl, {
        method: 'POST',
        headers,
        body: tokenParams.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token exchange failed:', errorText);
        success = false;
      } else {
        const tokens: TokenResponse = await response.json();

        // Store tokens
        localStorage.setItem('access_token', tokens.access_token);
        localStorage.setItem('id_token', tokens.id_token);
        if (tokens.refresh_token) {
          localStorage.setItem('refresh_token', tokens.refresh_token);
        }
        
        // Calculate expiry time
        const expiryTime = Date.now() + (tokens.expires_in * 1000);
        localStorage.setItem('token_expiry', expiryTime.toString());

        setAccessToken(tokens.access_token);
        setIsAuthenticated(true);
        success = true;
      }
    } catch (error) {
      console.error('Error during token exchange:', error);
      success = false;
    } finally {
      // Clear the 'isLoggingIn' flag so future login attempts can proceed
      try { sessionStorage.removeItem('isLoggingIn'); } catch (e) { /* ignore */ }
    }

    return success;
  };

  const value = {
    isAuthenticated,
    isLoading,
    login,
    logout,
    accessToken,
    handleAuthCallback,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Protected Route Component
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { isAuthenticated, isLoading, login } = auth;
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    const processCallback = async () => {
      // Check if this is an OAuth callback with code parameter
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (code && state && auth.handleAuthCallback) {
        setIsProcessingCallback(true);
        try {
          const success = await auth.handleAuthCallback(code, state);
          if (success) {
            // Clear the URL parameters after successful authentication
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (error) {
          console.error('Error processing callback:', error);
        } finally {
          setIsProcessingCallback(false);
        }
      } else if (!isLoading && !isAuthenticated && !hasRedirected) {
        // After logout, avoid immediate login; use configured logout redirect
        const justLoggedOut = sessionStorage.getItem('justLoggedOut');
        if (justLoggedOut) {
          try { sessionStorage.removeItem('justLoggedOut'); } catch (e) { /* ignore */ }
          setHasRedirected(true);
          // Let Cognito handle the redirect using VITE_OAUTH_LOGOUT_REDIRECT
          return;
        }
        // Prevent recursive login loops: if a login is already in progress, don't trigger another
        const logging = sessionStorage.getItem('isLoggingIn');
        if (logging) {
          console.log('Login already in progress, skipping duplicate trigger');
          setHasRedirected(true);
          return;
        }

        // Not authenticated - redirect to login
        setHasRedirected(true);
        login();
      }
    };

    processCallback();
  }, [isAuthenticated, isLoading, login, auth, hasRedirected]);

  if (isLoading || isProcessingCallback) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-b-2 border-blue-600 rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
