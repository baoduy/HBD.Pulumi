import * as pulumi from '@pulumi/pulumi';
import Core from '../_Shared/KubeX/Core';
import { stack } from '../_Shared/Common/StackEnv';
import {
  getIpAddressName,
  getResourceGroupName,
} from '../_Shared/Common/Naming';
import Tools from '../_Shared/KubeX/Tools';
import * as global from '../_Shared/Common/GlobalEnv';
import {
  aksClusterName,
  enableFirewall,
  enableCertManager,
  aksGroupName,
  internalAppIp,
  enableVirtualNode,
} from '../_Shared/Common/AppConfigs/aksConfig';
import { getSecret } from '../_Shared/KeyVault/Helper';
import { createAksProvider } from '../_Shared/KubeX/Providers';
import { envDomain, isPrd } from '../_Shared/Common/AzureEnv';
import { organizationName } from '../_Shared/Common/config';
import { getIpAddressResource } from '../_Shared/VNet/IpAddress';
import {
  PostgreSQL,
  SqlServer,
  Wikijs,
  YarpProxy,
  MariaDb,
  MySql,
  WordPress,
  RedisCache,
} from '../_Shared/KubeX/Apps';
import Storage from '../_Shared/Storage';
import { AksAzureStorageSecret } from '../_Shared/KubeX/ConfigSecret';
import * as k8s from '@pulumi/kubernetes';
import SingaX from './SingaX';

const rs = (async () => {
  const enableAksSql = false;
  const enablePostgreSql = false;
  const enableMySql = true;
  const enableWiki = false;
  const enableReverseProxy = false;
  const storageClassName = 'cs-csi-standard';

  //Azure Resources
  const group = { resourceGroupName: getResourceGroupName(aksGroupName) };
  const vaultInfo = global.keyVaultInfo;
  const provider = await createAksProvider({ aksName: aksClusterName, group });
  const publicIpAddress = enableFirewall
    ? undefined
    : await getIpAddressResource({ name: aksGroupName, group });

  const tcpPorts: any = { '6379': 'tools/redis-cache:6379' };

  if (enableMySql) {
    tcpPorts['3306'] = 'tools/my-sql-mariadb:3306';
  }
  if (enableAksSql) {
    tcpPorts['1433'] = 'tools/aks-sql:1433';
  }
  if (enablePostgreSql) {
    tcpPorts['5432'] = 'tools/postgre-sql-postgresql-ha-pgpool:5432';
  }

  //Install Kube Core
  const { namespacesList, resources } = await Core({
    namespaces: [{ name: stack }, { name: 'tools' }],

    nginx: {
      namespace: 'nginx-ingress',
      //version: '4.0.17',
      vnetResourceGroup: group.resourceGroupName,
      internalIngress: enableFirewall,

      public: {
        name: 'public',
        publicIpAddress: publicIpAddress?.ipAddress,
        internalIpAddress: internalAppIp,
        //Allows sql access from non prd environment.
        tcp: isPrd ? undefined : tcpPorts,
      },

      //This only work with Azure Firewall with internal Load Balancer
      // private: apiProtectedWithApimOnly
      //   ? {
      //       name: 'private',
      //       internalIpAddress: internalApiIp,
      //     }
      //   : undefined,
    },
    certManager: enableCertManager
      ? {
          email: `system@${envDomain}`,
          name: 'cert-manager',
          http01Issuer: { publicIngressClass: 'nginx' },
        }
      : undefined,
    storageClasses: { [storageClassName]: { skuName: 'StandardSSD_LRS' } },

    //This will support Lens to show the usage of VMs and Pods
    // monitoring: {
    //   namespace: 'monitoring',
    //   enablePrometheus: true,
    // },

    provider,
  });

  //Default Storage for AKS
  const storage = Storage({
    name: aksClusterName,
    group,
    vaultInfo,
    lock: false,
    fileShares: ['drunk-wp'],
  });

  storage.storage.id.apply(async (id) => {
    if (!id) return;
    //Add Storage Secrets to AKS
    const key = await getSecret({
      name: storage.vaultNames.primaryConnectionKeyName,
      vaultInfo,
      nameFormatted: true,
    });

    AksAzureStorageSecret({
      name: 'azure-storage',
      namespace: 'tools',
      fixedName: true,
      provider,
      accountName: storage.storage.name,
      accountKey: key!.value!,
    });
  });

  //Import certificates from app Order
  // await CertImports({
  //   namespaces: namespacesList.map((n) => n.metadata.name),
  //   provider,
  // });

  //Install Additional Apps
  if (enableAksSql) {
    await SqlServer({
      name: 'aks-sql',
      namespace: 'tools',
      storageClassName,
      vaultInfo,
      provider,
    });
  }

  if (enableMySql) {
    const mySql = await MariaDb({
      name: 'my-sql',
      namespace: 'tools',
      storageClassName,
      vaultInfo,
      provider,
    });

    await MySql({
      name: 'my-sql-v2',
      version: '8.0.27',
      namespace: 'tools',
      //customPort: 3307,
      useClusterIP: true,
      storageClassName,
      vaultInfo,
      provider,
    });

    const yaml_provider = new k8s.Provider('render-yaml', {
      renderYamlToDirectory: 'yaml-files',
    });

    await MySql({
      name: 'singa-sql',
      namespace: 'ocp-bp-dcp-sit',

      storageClassName,
      vaultInfo,
      provider: yaml_provider,
    });

    //Drunk coding WP
    await WordPress({
      name: 'wp',
      namespace: 'tools',
      hostNames: [envDomain, `www.${envDomain}`, `wp.${envDomain}`],
      volume: {
        storageClass: storageClassName,
      },
      database: {
        host: mySql.host,
        database: 'DrunkCodingWP',
        username: 'root',
        password: mySql.password,
      },
      provider,
    });
  }

  if (enablePostgreSql) {
    const postgres = await PostgreSQL({
      name: 'postgre-sql',
      namespace: 'tools',
      storageClassName,
      vaultInfo,
      provider,
    });

    if (enableWiki) {
      await Wikijs({
        name: 'wiki',
        namespace: 'tools',
        provider,
        createAzureAdIdentity: true,
        useVirtualHost: true,
        postgresql: {
          host: 'postgre-sql-postgresql-ha-pgpool',
          database: 'wikijsDb',
          username: postgres.username,
          password: postgres.password,
        },
      });
    }
  }

  if (enableReverseProxy) {
    await YarpProxy({
      name: 'reverse-proxy',
      namespace: stack,
      provider,
      enableHA: true,
      ingressConfig: {
        hostNames: [`proxy.${envDomain}`],
        className: 'nginx',
        certManagerIssuer: true,
      },
      reverseProxy: {
        clusters: [
          {
            destinationUrl:
              'https://webhook.site/612b499e-84af-4ff7-8fde-8d91c47ff6b2',
            routes: [
              {
                path: '/api/{**catch-all}',
                transforms: [{ PathRemovePrefix: '/api' }],
                headers: [
                  {
                    name: 'organization-name',
                    mode: 'ExactHeader',
                    values: ['hbd'],
                  },
                ],
              },
            ],
          },
          {
            destinationUrl:
              'https://webhook.site/bbafb17f-a273-4d15-a82a-208fd975a888',
            routes: [
              {
                path: '/api/{**catch-all}',
                transforms: [{ PathRemovePrefix: '/api' }],
                headers: [
                  {
                    name: 'organization-name',
                    mode: 'ExactHeader',
                    values: ['steven'],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  }

  // //Install WebApps
  // await WebApp({ namespace: 'dev', provider });

  //Redis Cache
  await RedisCache({
    name: 'redis-cache',
    namespace: 'tools',
    //storageClassName,
    provider,
  });

  //Install Projects
  SingaX({
    namespace: stack,
    provider,
    dependsOn: [...resources, ...namespacesList],
  });

  //Install Tools
  await Tools({
    namespace: 'tools',
    provider,

    enableKubeCleanup: true,
    toolPod: { useVirtualHost: false },
    //Only enable SqlPad in sandbox. Prd must using jump-box to access database.
    // sqlPad: isPrd
    //   ? undefined
    //   : {
    //       hostName: `sqlpad.${envDomain}`,
    //       auth: { azureAd: { allowedDomain: 'hywallet.io,hywallet.dev' } },
    //       vaultInfo,
    //       databases: {},
    //     },

    helloWorld: false
      ? {
          hostName: `${getIpAddressName(
            aksGroupName
          )}-${organizationName}.southeastasia.cloudapp.azure.com`,
          useVirtualHost: enableVirtualNode,
        }
      : undefined,

    dependsOn: [...resources, ...namespacesList],
  });
})();

module.exports = pulumi.output(rs);
