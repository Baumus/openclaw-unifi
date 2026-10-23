import {writeFile} from "node:fs/promises";
import entry from "../dist/index.js";
import {getToolPluginMetadata} from "openclaw/plugin-sdk/tool-plugin";
import {toolMetadata} from "../dist/tools.js";
const meta=getToolPluginMetadata(entry);
const manifest={
  id:meta.id,name:meta.name,version:"0.1.0",description:meta.description,categories:["infrastructure"],
  activation:meta.activation,skills:["./skills"],
  configSchema:meta.configSchema,
  configContracts:{secretInputs:{paths:[{path:"apiKey",expected:"string",ownerKind:"capability"}]}},
  uiHints:{
    apiKey:{label:"UniFi API key reference",sensitive:true,help:"Use Settings → Secrets to save a Protected secret, then select its full store SecretRef. No plaintext keys in configuration. External env/file/exec SecretRefs are supported."},
    requestTimeoutMs:{label:"Request timeout (milliseconds)",advanced:true},
    maxResponseBytes:{label:"Maximum JSON response bytes",advanced:true}
  },
  contracts:{tools:meta.tools.map(t=>t.name)},toolMetadata,
};
await writeFile(new URL("../openclaw.plugin.json",import.meta.url),JSON.stringify(manifest,null,2)+"\n");
