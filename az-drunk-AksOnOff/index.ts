import * as pulumi from '@pulumi/pulumi';
import {
  aksClusterName,
  aksGroupName,
} from '../_Shared/Common/AppConfigs/aksConfig';
import { AksTurnOffResource } from '../_Shared/CustomProviders/AksTurnOff';
import { getAksName, getResourceGroupName } from '../_Shared/Common/Naming';

const rs = (async () => {
  new AksTurnOffResource(aksClusterName, {
    resourceName: getAksName(aksClusterName),
    resourceGroupName: getResourceGroupName(aksGroupName),
  });
})();

module.exports = pulumi.output(rs);
