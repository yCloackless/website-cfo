// Test profile save on /api/rumo-estudos/profile
const BASE = 'http://127.0.0.1:3000';

async function main() {
  // Step 1: Login
  console.log('=== Step 1: Login ===');
  const loginRes = await fetch(`${BASE}/api/auth/check-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'jb080956@gmail.com', password: 'admin123' }),
  });
  console.log('Login status:', loginRes.status);
  const loginData = await loginRes.json();
  console.log('Login response:', JSON.stringify(loginData, null, 2));

  // Extract token from cookies or response
  const cookies = loginRes.headers.getSetCookie?.() || [];
  console.log('Cookies:', cookies);
  
  // Try with token from response
  const token = loginData.token;
  if (!token) {
    console.log('No token in response, trying with cookie...');
  }
  
  // Build auth headers
  const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) authHeaders['Authorization'] = `Bearer ${token}`;
  if (cookies.length > 0) {
    authHeaders['Cookie'] = cookies.map((c: string) => c.split(';')[0]).join('; ');
  }
  console.log('Auth headers:', authHeaders);

  // Step 2: Try to access the profile
  console.log('\n=== Step 2: Get Profile ===');
  const profileRes = await fetch(`${BASE}/api/rumo-estudos/profile`, {
    headers: authHeaders,
  });
  console.log('Profile GET status:', profileRes.status);
  const profileData = await profileRes.json();
  console.log('Profile data:', JSON.stringify(profileData, null, 2));

  // Step 3: Try to save profile
  console.log('\n=== Step 3: Save Profile (PATCH) ===');
  const saveBody = {
    displayName: 'Teste Estudante',
    institution: 'IFRJ',
    campus: 'Maracanã',
    course: 'Química',
    onboardingCompleted: true,
  };
  console.log('Save body:', JSON.stringify(saveBody, null, 2));
  
  const saveRes = await fetch(`${BASE}/api/rumo-estudos/profile`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(saveBody),
  });
  console.log('Profile PATCH status:', saveRes.status);
  const saveData = await saveRes.text();
  console.log('Profile PATCH response:', saveData);
}

main().catch(console.error);
