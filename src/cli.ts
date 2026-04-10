import process from 'node:process';
import Yargs from 'yargs';
import { setGlobalDispatcher } from 'undici';
import * as commands from './cli/commands.js';
import { checkUpdates } from './common/update.js';
import createDebug from './util/debug.js';
import { dev, embedded_nxapi_auth_cli_client_id, pkg, product } from './util/product.js';
import { paths } from './util/storage.js';
import { YargsArguments } from './util/yargs.js';
import { addUserAgent } from './util/useragent.js';
import { USER_AGENT_INFO_URL } from './common/constants.js';
import { init as initGlobals } from './common/globals.js';
import { buildEnvironmentProxyAgent } from './util/undici-proxy.js';
import { NxapiClientAssertionProvider, setClientAssertionProvider } from './util/nxapi-auth.js';

const debug = createDebug('cli');

initGlobals();

const agent = buildEnvironmentProxyAgent();
setGlobalDispatcher(agent);

export function createYargs(argv: string[]) {
    const yargs = Yargs(argv).option('data-path', {
        describe: 'Data storage path',
        type: 'string',
        default: process.env.NXAPI_DATA_PATH || paths.data,
    });

    for (const command of Object.values(commands)) {
        if (command.command === 'app' && !dev) continue;

        // @ts-expect-error
        yargs.command(command);
    }

    yargs
        .scriptName('nxapi')
        .demandCommand()
        .help()
        // .version(false)
        .version(product)
        .showHelpOnFail(false, 'Specify --help for available options');

    return yargs;
}

export type Arguments = YargsArguments<ReturnType<typeof createYargs>>;

// Node.js docs recommend using process.stdout.isTTY (see https://github.com/samuelthomas2774/nxapi/issues/15)
const is_terminal = process.stdin.isTTY && process.stderr.isTTY;

export async function main(argv = process.argv.slice(2)) {
    addUserAgent('nxapi-cli');

    if (process.env.NXAPI_USER_AGENT) {
        addUserAgent(process.env.NXAPI_USER_AGENT);
    } else if (!is_terminal) {
        console.warn('[warn] The nxapi command is not running in a terminal. If using the nxapi command in a script or other program, the NXAPI_USER_AGENT environment variable should be set. See ' + USER_AGENT_INFO_URL + '.');
        addUserAgent('unidentified-script');
    }

    if (embedded_nxapi_auth_cli_client_id) {
        setClientAssertionProvider(new NxapiClientAssertionProvider(embedded_nxapi_auth_cli_client_id, undefined,
            'ca:gf ca:er ca:dr ca:na'));
    } else if (pkg.__nxapi_auth?.cli?.client_id) {
        setClientAssertionProvider(new NxapiClientAssertionProvider(pkg.__nxapi_auth.cli.client_id, undefined,
            'ca:gf ca:er ca:dr ca:na'));
    } else if (process.env.NXAPI_AUTH_CLIENT_ID) {
        setClientAssertionProvider(new NxapiClientAssertionProvider(process.env.NXAPI_AUTH_CLIENT_ID, undefined,
            process.env.NXAPI_AUTH_SCOPE ?? 'ca:gf ca:er ca:dr'));
    } else {
        // Fallback client ID for local/dev builds (was public in git history before 7569d44)
        setClientAssertionProvider(new NxapiClientAssertionProvider('CKtknJ6HiH2AZIMw-x8ljw', undefined,
            'ca:gf ca:er ca:dr ca:na'));
    }

    const yargs = createYargs(argv);

    if (!process.env.NXAPI_SKIP_UPDATE_CHECK) await checkUpdates();

    yargs.argv;
}
