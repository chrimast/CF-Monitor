const PROVIDER_META = {
  cloudflare: {
    name: "Cloudflare",
    fields: [
      { id: "apikey", label: "API Token / Key", type: "password" },
      { id: "email", label: "\u90AE\u7BB1\uFF08\u4EC5 Global Key\uFF09" },
      { id: "auth", label: "\u8BA4\u8BC1\uFF1A1=Token\uFF0C0=Key", placeholder: "1" }
    ]
  },
  aliyun: {
    name: "\u963F\u91CC\u4E91",
    fields: [
      { id: "AccessKeyId", label: "AccessKeyId" },
      { id: "AccessKeySecret", label: "AccessKeySecret", type: "password" }
    ]
  },
  dnspod: {
    name: "\u817E\u8BAF\u4E91 DNSPod",
    fields: [
      { id: "SecretId", label: "SecretId" },
      { id: "SecretKey", label: "SecretKey", type: "password" }
    ]
  },
  huawei: {
    name: "\u534E\u4E3A\u4E91",
    fields: [
      { id: "AccessKeyId", label: "AccessKeyId" },
      { id: "SecretAccessKey", label: "SecretAccessKey", type: "password" }
    ]
  },
  namesilo: {
    name: "NameSilo",
    fields: [{ id: "apikey", label: "API Key", type: "password" }]
  },
  dnsla: {
    name: "DNSLA",
    fields: [
      { id: "apiid", label: "APIID" },
      { id: "apisecret", label: "API\u5BC6\u94A5", type: "password" }
    ]
  },
  west: {
    name: "\u897F\u90E8\u6570\u7801",
    fields: [
      { id: "username", label: "\u7528\u6237\u540D" },
      { id: "api_password", label: "API\u5BC6\u7801", type: "password" }
    ]
  }
};
export {
  PROVIDER_META
};
