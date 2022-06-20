import * as pulumi from '@pulumi/pulumi';
import ResourceGroup from '../_Shared/Core/ResourceGroup';
import Vnet from '../_Shared/VNet';
import { envDomain, lockResourceGroup } from '../_Shared/Common/AzureEnv';
import { global } from '../_Shared/Common';
import aksFirewallPolicy from '../_Shared/VNet/FirewallPolicies/AksFirewallPolicy';
import Aks from './Aks';
import {
  aksGroupName,
  aksClusterName,
  aksSpace,
  firewallSpace,
  privateSpace,
  enableFirewall,
  vnetAddressSpace,
  internalAppIp,
  privateCluster,
  defaultAksAdmins,
  enableVirtualNode,
  aksVirtualNodeSpace,
} from '../_Shared/Common/AppConfigs/aksConfig';
import PrivateDns from '../_Shared/VNet/PrivateDns';
import { VmSizes } from '../_Shared/Aks';
import { getIdentity } from '../_Shared/AzAd/Helper';
import { SubnetProps } from '../_Shared/VNet/Vnet';

const rs = (async () => {
  //Get ADO object Id;
  //const ado = await getIdentity('azure-devops', true);

  //Az resources
  const group = (
    await ResourceGroup({ name: aksGroupName, lock: lockResourceGroup })
  ).toGroupInfo();

  //Environment Key Vault
  const vaultInfo = global.keyVaultInfo;

  const subnets: Array<SubnetProps> = [
    {
      name: 'aks',
      addressPrefix: aksSpace,
      allowedServiceEndpoints: ['Microsoft.Sql'],
    },
    {
      name: 'private',
      addressPrefix: privateSpace,
      //enablePrivateEndpoint: false,
      //enablePrivateLinkService: false,
      //allowedServiceEndpoints: ["Microsoft.Sql"],
    },
  ];

  //This only able to remove once disabled the AKS virtual host add-on.
  if (true) {
    subnets.push({
      name: 'aks-virtual',

      addressPrefix: aksVirtualNodeSpace,
      allowedServiceEndpoints: ['Microsoft.Sql'],
      delegateServices: ['Microsoft.ContainerInstance/containerGroups'],
      enableRouteTable: false,
    });
  }

  //vnet
  const { findSubnet, publicIpAddress, vnet } = await Vnet({
    name: aksGroupName,
    group,
    addressSpace: vnetAddressSpace,
    subnets,
    features: {
      enablePublicIpAddress: true,
      enableFirewall: enableFirewall
        ? {
            //donotCreateFirewall: true,
            subnetPrefix: firewallSpace,
            policyCreator: ({ publicIpAddress }) => ({
              priority: 300,
              rules: [
                aksFirewallPolicy({
                  name: aksGroupName,
                  location: group.location!,
                  allowAccessPublicRegistries: true,
                  privateCluster,
                  vnetAddressSpace,
                  natRule: {
                    internalIpAddress: internalAppIp,
                    publicIpAddress: publicIpAddress.ipAddress.apply(
                      (ip) => ip || ''
                    ),

                    // apim: {
                    //   apimPublicIpAddress: apim.publicIPAddresses.apply(
                    //     (ip) => ip[0]
                    //   ),
                    //   internalIpAddress: internalApiIp,
                    // },
                  },
                }),
              ],
            }),
          }
        : undefined,

      securityGroup: {
        //Enable this for AKS setup
        allowInternetAccess: true,

        rules: [
          //Allows Some Database Servers Inbound in NON-PRD
          {
            name: 'allow-sql-in',
            sourceAddressPrefix: '*',
            sourcePortRange: '*',
            destinationAddressPrefix: '*',
            destinationPortRange: '*', //MsSql, Postgres and MySql
            protocol: 'TCP',
            access: 'Allow',
            direction: 'Inbound',
            priority: 300,
          },
          //This rules need for vnet peering
          //{
          //         name: "allow-vnet-to-load-balancer",
          //         sourceAddressPrefix: "*",
          //         sourcePortRange: "*",
          //         destinationAddressPrefix: "AzureLoadBalancer",
          //         destinationPortRange: "*",
          //         protocol: "*",
          //         access: "Allow",
          //         direction: "Outbound",
          //         priority: 300,
          //       },
        ],
      },
    },
    //Add logWP for Firewall
    monitorConfig: global.logWpInfo,
  });
  if (enableFirewall || privateCluster) {
    //Create Private DNS Zone for Environment Domain to control the internal request
    PrivateDns({
      name: envDomain,
      group,
      vnetIds: [vnet.id],
      records: {
        aRecords: [
          { recordName: '@', ipAddresses: [internalAppIp] },
          { recordName: '*', ipAddresses: [internalAppIp] },
        ],
      },
    });
  }

  const aksSubId = findSubnet('aks').apply((c) => c!.id!);
  //Ask
  await Aks({
    name: aksClusterName,
    group,
    vmSize: VmSizes.Standard_B2ms_77,
    //Only enable private AKS in PRD
    enablePrivateCluster: privateCluster,

    network: {
      //Remove this the only cluster will be deleted. The other like ssh, identity and security group are still remains.
      subnetId: aksSubId,
      virtualHostSubnetName: enableVirtualNode ? 'aks-virtual' : undefined,

      enableFirewall,
      //Without public IpAddress, the cluster will be created with Basic Load balancer
      ipAddressId: publicIpAddress?.id,
    },

    // authorizedIPRanges: privateCluster
    //   ? undefined
    //   : [
    //       publicIpAddress!.ipAddress!.apply((ip) => ip!),
    //       ...tranSwapDevIps,
    //       ...managersIps.map((i) => i.ip),
    //     ],

    //Add logWP for Aks
    log: global.logWpInfo,
    vaultInfo,

    lock: false,
    dependsOn: [publicIpAddress!, vnet],
  });

  //Link private zone to peering vnet so that terminal VM can access the cluster
  // if (privateZone) {
  //   privateZone.name.apply((n) =>
  //     linkVnetToPrivateDns({
  //       zoneName: n,
  //       group,
  //       vnetId: peeringVnetId,
  //       registrationEnabled: false,
  //       dependsOn: privateZone,
  //     })
  //   );
  // }

  return group;
})();

module.exports = pulumi.output(rs);
