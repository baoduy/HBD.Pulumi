# ReadMe
Pulumi Token for testing purposes: pul-606419c8f935b104591b83562acf10a15e95e2e2

## Upgrading to Pulumi/AzureAD issues
https://github.com/pulumi/pulumi-azuread/issues/185#issuecomment-982414862
We have now upgraded several stacks to use the new 5.x azure ad instead of the 4.x azure ad. The way we achieved it is the following:

Use pulumi state export --file state.json (Please also take a backup of the state.json file before changing it)
Find the AppRegistration resource in the file, should have the type **azuread:index/application:Application**
Remove the publicClient property from the Output block
If the __meta property is there, remove that as well
Reimport the state with pulumi state import --file state.json
The next time you are running pulumi preview or pulumi up make sure that you do not use the -r or --refresh option, since that will revert the state file again.
Running pulumi refresh will also revert the state file back to the original incompatible state.
It is also possible to try and remove the complete output block from the azure ad app registration resource.