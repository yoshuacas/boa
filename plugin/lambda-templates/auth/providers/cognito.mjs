/** @type {import('./interface.mjs').AuthProvider} */
const provider = {
  async signUp(email, password) {
    throw new Error('not implemented');
  },
  async signIn(email, password) {
    throw new Error('not implemented');
  },
  async refreshToken(providerRefreshToken) {
    throw new Error('not implemented');
  },
  async getUser(providerAccessToken) {
    throw new Error('not implemented');
  },
  async signOut(providerAccessToken) {
    throw new Error('not implemented');
  },
};

export default provider;
