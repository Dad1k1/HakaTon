async function csrfToken() {
  const response = await fetch('/api/auth/csrf', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not start the sign-out request.');
  return (await response.json()).csrfToken as string;
}

export async function signOutLocally() {
  const token = await csrfToken();
  const response = await fetch('/api/auth/signout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: token, callbackUrl: '/', json: 'true' }),
  });
  if (!response.ok) throw new Error('Sign-out failed.');
  window.location.assign('/');
}
