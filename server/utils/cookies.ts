/**
 * Parse Cookie header into an object
 */
export function parseCookies(header: string | undefined): Record<string, string> {
    if (!header) {return {};}

    return header.split(';').reduce((acc, cookie) => {
        const parts = cookie.trim().split('=');
        if (parts.length >= 2) {
            const name = parts[0];
            const value = parts.slice(1).join('='); // Handle values with =
            acc[name] = value;
        }
        return acc;
    }, {} as Record<string, string>);
}
