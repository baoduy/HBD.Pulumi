import * as pulumi from '@pulumi/pulumi';
import { global } from '../_Shared/Common';
import ResourceGroup from '../_Shared/Core/ResourceGroup';
import Vault from '../_Shared/KeyVault';
import Log from '../_Shared/Logs/index';
import { organizationName } from '../_Shared/Common/config';
import { grantVaultAccessPolicy } from '../_Shared/KeyVault/VaultPermissions';
import { lockResourceGroup, vaultEnableRbac } from '../_Shared/Common/AzureEnv';
import { defaultAksAdmins } from '../_Shared/Common/AppConfigs/aksConfig';
import AdoIdentity from '../_Shared/AzAd/Identities/AzDevOps';
import ContainerCreator from '../_Shared/ContainerRegistry';

const rs = (async () => {
  //Global Group
  const group = (
    await ResourceGroup({
      name: global.groupInfo.resourceGroupName,
      lock: lockResourceGroup,
    })
  ).toGroupInfo();

  //Global Group
  const logGroup = (
    await ResourceGroup({
      name: global.logGroupInfo.resourceGroupName,
      lock: false,
    })
  ).toGroupInfo();

  //Global Key Vault
  const vault = await Vault({
    name: organizationName,
    group,
    createDefaultValues: true,
    enableRbac: vaultEnableRbac,

    permissions: defaultAksAdmins.map((d) => ({
      objectId: d.objectId,
      permission: 'ReadWrite',
    })),

    // network: {
    //   ipAddresses: [
    //     aksSandboxIp,
    //     aksPrdIp,
    //     ...tranSwapDevIps,
    //     ...managersIps.map((i) => i.ip),
    //   ],
    // },
  });
  const vaultInfo = vault.toVaultInfo();

  //Log analytics & log storage
  const log = Log({
    name: organizationName,
    group: logGroup,
    logWpSku: 'PerGB2018',
    dailyQuotaGb: 0.1,
    vaultInfo,
  });
  const logInfo = log.toLogStorageInfo();

  //Add Log for Key vault
  await vault.addDiagnostic({
    ...logInfo,
  });

  //Azure DevOPs principal
  const ado = await AdoIdentity({
    vaultInfo,
  });

  //Azure Container Registry
  await ContainerCreator({ name: organizationName, group, vaultInfo });

  //Grant key vault permission to ADO
  if (!vaultEnableRbac) {
    grantVaultAccessPolicy({
      vaultInfo,
      name: 'azure-devops-vault-permission',
      permission: 'ReadWrite',
      objectId: ado.objectId,
    });
  }

  return { group };
})();

module.exports = pulumi.output(rs);
