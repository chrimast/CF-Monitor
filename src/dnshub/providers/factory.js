import { AliyunProvider } from "./aliyun.js";
import { CloudflareProvider } from "./cloudflare.js";
import { DnslaProvider } from "./dnsla.js";
import { DnspodProvider } from "./dnspod.js";
import { HuaweiProvider } from "./huawei.js";
import { NamesiloProvider } from "./namesilo.js";
import { WestProvider } from "./west.js";
function createProvider(opts) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  switch (opts.provider) {
    case "cloudflare":
      return new CloudflareProvider(opts.credentials, fetchImpl, opts.domain, opts.domainId);
    case "aliyun":
      return new AliyunProvider(
        opts.credentials.AccessKeyId ?? "",
        opts.credentials.AccessKeySecret ?? "",
        fetchImpl,
        opts.domain
      );
    case "dnspod":
      return new DnspodProvider(
        opts.credentials.SecretId ?? "",
        opts.credentials.SecretKey ?? "",
        fetchImpl,
        opts.domain
      );
    case "huawei":
      return new HuaweiProvider(
        opts.credentials.AccessKeyId ?? "",
        opts.credentials.SecretAccessKey ?? "",
        fetchImpl,
        opts.domain,
        opts.domainId
      );
    case "namesilo":
      return new NamesiloProvider(opts.credentials.apikey ?? "", fetchImpl, opts.domain);
    case "dnsla":
      return new DnslaProvider(
        opts.credentials.apiid ?? "",
        opts.credentials.apisecret ?? "",
        fetchImpl,
        opts.domain,
        opts.domainId
      );
    case "west":
      return new WestProvider(
        opts.credentials.username ?? "",
        opts.credentials.api_password ?? "",
        fetchImpl,
        opts.domain
      );
    default:
      throw new Error(`Unsupported provider: ${opts.provider}`);
  }
}
export {
  createProvider
};
