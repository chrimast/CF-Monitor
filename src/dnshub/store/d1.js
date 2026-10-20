class D1Store {
  constructor(db) {
    this.db = db;
  }
  async listAccounts() {
    const { results } = await this.db.prepare("SELECT id, name, provider, credentials, created_at FROM dnshub_accounts ORDER BY created_at DESC").all();
    return (results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      credentials: JSON.parse(row.credentials),
      createdAt: row.created_at
    }));
  }
  async getAccount(id) {
    const row = await this.db.prepare("SELECT id, name, provider, credentials, created_at FROM dnshub_accounts WHERE id = ?").bind(id).first();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      credentials: JSON.parse(row.credentials),
      createdAt: row.created_at
    };
  }
  async saveAccount(account) {
    await this.db.prepare("INSERT INTO dnshub_accounts (id, name, provider, credentials, created_at) VALUES (?, ?, ?, ?, ?)").bind(account.id, account.name, account.provider, JSON.stringify(account.credentials), account.createdAt).run();
  }
  async deleteAccount(id) {
    await this.db.prepare("DELETE FROM dnshub_accounts WHERE id = ?").bind(id).run();
  }
}
export {
  D1Store
};
