import process from 'node:process';

const status = Number(process.env.EMAIL_TEST_STATUS || 200);
const preview = process.env.EMAIL_TEST_PREVIEW === '1';
process.env = new Proxy(process.env, {
  get(target, key) {
    if (preview && key === 'EMAIL_API_KEY') throw new Error('Preview read an API key');
    return Reflect.get(target, key);
  },
});
// No fallback to the real fetch implementation, even for a different URL.
globalThis.fetch = async (url, options) => {
  if (preview || url !== 'https://api.resend.com/emails' || options.method !== 'POST')
    throw new Error('Unexpected network operation in offline artifact test');
  return new globalThis.Response(JSON.stringify({ id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' }), {
    status,
  });
};
