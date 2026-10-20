class MemoryStore {
  accounts = /* @__PURE__ */ new Map();
  async listAccounts() {
    return [...this.accounts.values()];
  }
  async getAccount(id) {
    return this.accounts.get(id) ?? null;
  }
  async saveAccount(account) {
    this.accounts.set(account.id, account);
  }
  async deleteAccount(id) {
    this.accounts.delete(id);
  }
}
export {
  MemoryStore
};
