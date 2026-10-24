import {writeFile} from "node:fs/promises";
import entry from "../dist/index.js";
import {getToolPluginMetadata} from "openclaw/plugin-sdk/tool-plugin";
import {toolMetadata} from "../dist/definitions.js";
import {PLUGIN_VERSION} from "../dist/version.js";
const meta=getToolPluginMetadata(entry);
const manifest={
  id:meta.id,name:meta.name,version:PLUGIN_VERSION,description:meta.description,categories:["infrastructure"],
  uiCapabilities:["page","navigation"],
  activation:meta.activation,skills:["./skills"],
  configSchema:meta.configSchema,
  configContracts:{secretInputs:{paths:[{path:"apiKey",expected:"string",ownerKind:"capability"}]}},
  uiHints:{
    apiKey:{label:"UniFi API key reference",sensitive:true,advanced:true,help:"Open UniFi in the sidebar for automatic token setup. This advanced field accepts external env/file/exec/store SecretRefs only."},
    setupBinding:{label:"Automatic connection generation",advanced:true,help:"Managed automatically by UniFi setup; do not edit."},
    requestTimeoutMs:{label:"Request timeout (milliseconds)",advanced:true},
    maxResponseBytes:{label:"Maximum JSON response bytes",advanced:true}
  },
  contracts:{tools:meta.tools.map(t=>t.name)},toolMetadata,
};
await writeFile(new URL("../openclaw.plugin.json",import.meta.url),JSON.stringify(manifest,null,2)+"\n");
