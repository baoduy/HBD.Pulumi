import {
  BasicMonitorArgs,
  KeyVaultInfo,
  ResourceGroupInfo,
} from '../../_Shared/types';

import Aks, { VmSizes } from '../../_Shared/Aks';
import { Input, Resource } from '@pulumi/pulumi';
import { randomSsh } from '../../_Shared/Core/Random';
import { isPrd } from '../../_Shared/Common/AzureEnv';

interface Props {
  name: string;
  group: ResourceGroupInfo;
  vmSize: VmSizes;
  enablePrivateCluster?: boolean;
  log: BasicMonitorArgs;

  network: {
    subnetId?: Input<string>;
    virtualHostSubnetName?: Input<string>;
    appGatewaySubnetId?: Input<string>;
    ipAddressId?: Input<string>;
    enableFirewall?: boolean;
  };
  authorizedIPRanges?: Input<string>[];

  vaultInfo: KeyVaultInfo;
  lock?: boolean;
  dependsOn?: Input<Resource>[];
  importFrom?: string;
}

export default async ({
  name,
  vmSize,
  enablePrivateCluster,
  vaultInfo,
  network,
  authorizedIPRanges,
  ...props
}: Props) => {
  const ssh = await randomSsh({ name, vaultInfo });
  //Load public key from key vault if the property is undefined
  const publicKey = ssh.ssh?.publicKey || (await ssh.lists.getPublicKey());
  const adminUsername = ssh.userName || (await ssh.lists.getUserName());

  //Aks
  const aks = await Aks({
    name,
    ...props,

    linux: {
      adminUsername,
      sshKeys: [publicKey],
    },

    aksAccess: {
      enableAzureRBAC: true,
      enablePrivateCluster,
      authorizedIPRanges,
    },

    addon: {
      enableAzureKeyVault: false,
      enableAzurePolicy: true,
      applicationGateway: network.appGatewaySubnetId
        ? { gatewaySubnetId: network.appGatewaySubnetId }
        : undefined,
    },

    nodePools: [
      {
        name: 'sys',
        mode: 'System',
        maxPods: 50,
        vmSize,
        osDiskType: isPrd ? 'Ephemeral' : 'Managed',
      },
    ],
    featureFlags: { createServicePrincipal: true },

    network: {
      subnetId: network.subnetId,
      virtualHostSubnetName: network.virtualHostSubnetName,
      enableFirewall: network.enableFirewall,

      outboundIpAddress: network.ipAddressId
        ? { ipAddressId: network.ipAddressId }
        : undefined,
    },
    vaultInfo,
  });

  return { ...aks, adminUsername };
};
