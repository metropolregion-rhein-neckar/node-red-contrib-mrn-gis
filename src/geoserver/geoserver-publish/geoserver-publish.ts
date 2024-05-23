// IN:  File path to the GeoPackage file to publish on GeoServer
// OUT: URLs of the WMS and/or WFS services created by GeoServer for the published GeoPackage file.
//      Note that these can be more than one, so the node might send multiple outgoing messages for one input


import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import { buildUrlPath } from 'node-red-typescript-essentials/util'
import axios, { AxiosResponse } from 'axios'
import * as fs from 'fs'
import * as path from 'path'


module.exports = function (RED: any) {

    class GeoServerPublishConfig {
        constructor(
            public geoServerConfigNodeId: string,         
            public geoserverWorkspace: string,
            public geoserverDatastoreName: string

        ) { }
    }

    class GeoServerPublishNode extends AbstractNode {

        private readonly fileEndingsGeotif = [".tif", ".tiff", ".geotif", ".geotiff"];
        private readonly url_rest: string;
        private readonly url_workspaces: string;
        private readonly auth: any;
        private readonly configNode: any;

        constructor(public config: GeoServerPublishConfig) {
            super(config, RED)

            this.on('input', this.onInput);
            this.configNode = RED.nodes.getNode(this.config.geoServerConfigNodeId);    

            this.auth = {
                username: this.configNode.config.geoServerUsername,
                password: this.configNode.config.geoServerPassword
            }
            this.url_rest = buildUrlPath(this.configNode.config.geoServerBaseUrl, "rest/");
            this.url_workspaces = buildUrlPath(this.url_rest, "workspaces/");
        }


        async onInput(msg: any) {
            this.status(new NodeStatus());
            setTimeout(async () => {
                try {
                    await this.process(msg);
                } catch (error) {
                    this.updateStatusWithError(error);
                }
            }, 100);
        }

        private updateStatusWithError(error: any) {
            this.status(new NodeStatus("ERROR: " + error, Fill.red));
        }

        private async process(msg: any) {
            let uploadFilePath = msg.payload;
            if (!fs.existsSync(uploadFilePath)) {
                this.updateStatusWithError("File not found: " + uploadFilePath);
                return;
            }
    
            let datastore_name = this.getDatastoreName(uploadFilePath);
            let file = fs.createReadStream(uploadFilePath);
            let fileSuffix = path.extname(uploadFilePath);
    
            
            if (fileSuffix == ".gpkg") {
                await this.handleGpkgUpload(datastore_name, file);
            } else if (this.fileEndingsGeotif.includes(fileSuffix)) {
                await this.handleGeoTiffUpload(datastore_name, file);
            } else {
                this.updateStatusWithError("File type not supported: " + fileSuffix);
            }
        }
        private getDatastoreName(uploadFilePath: string): string {
            let datastore_name = path.basename(uploadFilePath);
            if (this.config.geoserverDatastoreName != "") {
                datastore_name = this.config.geoserverDatastoreName;
            }
            return datastore_name;
        }
        private async handleGpkgUpload(datastore_name: string, file: any) {
            let headers: any = {};

            let url_upload = this.url_workspaces + this.config.geoserverWorkspace + "/datastores/" + datastore_name + "/file.gpkg?configure=all";
            this.status(new NodeStatus("Uploading GeoPackage to GeoServer...", Fill.green));

            let promise = await axios.put(url_upload, file, { headers: headers, auth: this.auth, maxBodyLength: Infinity, maxContentLength: Infinity }).catch((error) => {
                this.updateStatusWithError("Publishing to GeoServer failed. " + error);
            });

            await this.onGpkgUploadSuccess(promise, datastore_name);
        }

        private async handleGeoTiffUpload(datastore_name: string, file: any) {
            let headers: any = {
                "Content-Type": "image/tiff"
            };

            let url_upload = this.url_workspaces + this.config.geoserverWorkspace + "/coveragestores/" + datastore_name + "/file.geotiff";

            this.status(new NodeStatus("Uploading GeoTiff to GeoServer...", Fill.green));

            let promise = await axios.put(url_upload, file, { headers: headers, auth: this.auth, maxBodyLength: Infinity, maxContentLength: Infinity }).catch((error) => {
                this.updateStatusWithError("Publishing to GeoServer failed. " + error);
            });

            await this.onGeoTiffUploadSuccess(promise, datastore_name);
        }

        private async onGpkgUploadSuccess(response_upload: any, datastore_name: string) {
            this.status(new NodeStatus("GeoPackage successfully published.", Fill.green));

            let url_metadata = this.url_workspaces + this.config.geoserverWorkspace + "/datastores/" + datastore_name + "/featuretypes.json";
            let response = await this.getMetadata(url_metadata);

            if (response == undefined) {
                this.updateStatusWithError("Fetching of feature types description failed.");
                return;
            }

            let featureTypes = response.data.featureTypes.featureType;
            for (let ft of featureTypes) {
                this.sendCapabilitiesUrls(ft.name);
            }
        }

        private async onGeoTiffUploadSuccess(response_upload: any, datastore_name: string) {
            this.status(new NodeStatus("GeoTiff successfully published.", Fill.green));

            let url_metadata = this.url_workspaces + this.config.geoserverWorkspace + "/coveragestores/" + datastore_name + "/coverages.json";
            let response = await this.getMetadata(url_metadata);

            if (response == undefined) {
                this.updateStatusWithError("Fetching of coverage stores metadata failed.");
                return;
            }

            let coverages = response.data.coverages.coverage;
            for (let coverage of coverages) {
                this.sendCapabilitiesUrls(coverage.name);
            }
        }
        private async getMetadata(url_metadata: string) {

            return await axios.get(url_metadata, {auth: this.auth, maxBodyLength: Infinity, maxContentLength: Infinity }).catch((error) => {
                this.updateStatusWithError("Fetching of feature types description failed. " + error);
            }) as AxiosResponse;
        }
    
        private sendCapabilitiesUrls(name: string) {
            let wmsCapabilitiesUrl = this.configNode.config.geoServerBaseUrl + "/" + this.config.geoserverWorkspace + "/" + name + "/wms?service=WMS&version=1.3.0&request=GetCapabilities";
            this.send({ 'payload': wmsCapabilitiesUrl });
            let wfsCapabilitiesUrl = this.configNode.config.geoServerBaseUrl + "/" + this.config.geoserverWorkspace + "/" + name + "/ows?service=WFS&version=2.0.0&request=GetCapabilities";
            this.send({ 'payload': wfsCapabilitiesUrl });
        }
        
    }

    RED.nodes.registerType("geoserver-publish", GeoServerPublishNode);
}