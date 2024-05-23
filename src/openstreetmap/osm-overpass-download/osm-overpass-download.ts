// IN:  -
// OUT: File path to downloaded OSM overpass API response JSON file as message payload

import { AbstractNode } from 'node-red-typescript-essentials/AbstractNode'
import { NodeStatus, Shape, Fill } from 'node-red-typescript-essentials/node_status'
import { formatNumberString } from 'node-red-typescript-essentials/util';
import { testFileWrite } from 'node-red-typescript-essentials/util';
import { getAbsoluteFilePath } from 'node-red-typescript-essentials/tempDirUtil'
import axios, { AxiosResponse } from 'axios'
import * as fs from 'fs'

module.exports = function (RED: any) {

    class OverpassDownloadConfig  {
        constructor(
            public bbox: string,
            public tags: string,
            public overpassEndpointUrl: string,           
            public outfilePath: string
        ) { }
    }


    class OverpassDownload extends AbstractNode {
        downloadedBytes = 0
    
        constructor(public config: OverpassDownloadConfig) {
            super(config, RED)
            this.on('input', this.onInput);
        }
    
        async onInput(msg: any, done:any) {
            try {
                this.downloadedBytes = 0
    
                let bbox = `(${this.config.bbox})`;
                let tags = this.config.tags.split(",");
                let query = this.buildQuery(bbox, tags);
    
                let outfilePath = getAbsoluteFilePath(this.config.outfilePath, ".overpass.json");
                if (!testFileWrite(outfilePath)) {
                    this.updateStatus(`Unable to write to file: ${outfilePath}`, "red");
                    return;
                }
    
                let fileWriter = fs.createWriteStream(outfilePath);
                this.updateStatus("Starting download ...", "grey");
    
                let response = await this.retryDownload(query, msg, done);
                if (!response) return;
    
                this.writeToFile(response, fileWriter, msg, outfilePath);
            } catch (error) {
                this.updateStatus(`Overpass download failed. ${error}`, "red");
            }
        }
        
        updateStatus(text: string, fill: string|undefined = undefined) {
            let info:any = {
                fill: fill,
                shape: "dot",
                text: text,
            }
            this.status(info);
        }

        async retryDownload(query: string, msg: any, done: any): Promise<AxiosResponse | undefined> {
            let retries = 0;
            let response = undefined;
    
            while (!response && retries < 3) {
                response = await axios.post(this.config.overpassEndpointUrl, query, {
                    responseType: "stream",
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                }).catch((error) => {
                    console.log(error);
                    retries++;
                    console.log("retries:", retries);
                    if (retries < 3) {
                        this.error(`${error.message}. Trying again..`, msg);
                        this.updateStatus("Download failed. Trying again...", "yellow");
                    } else {
                        this.updateStatus(`Overpass download failed. ${error}`, "red")
                        done(`${error.message}. Overpass download failed three times in a row. See console for error log.`);
                    }
                });
            }
    
            return response || undefined;
        }
    
        writeToFile(response: AxiosResponse, fileWriter: fs.WriteStream, msg: any, outfilePath:string) {
            response.data.pipe(fileWriter);
    
            fileWriter.on('error', (error) => {
                this.updateStatus(`File writer error. ${error}`, "red");
            });
    
            fileWriter.on('finish', () => {
                this.updateStatus("Download finished", "green");
                msg.payload = outfilePath;
                this.send(msg);
            });
    
            response.data.on('data', (chunk: any) => {
                this.downloadedBytes += chunk.length;
                this.updateStatus(`Downloading ... ${formatNumberString(this.downloadedBytes, 0, ".", ",")} Bytes`);
            });
        }
    
    
        buildQuery(bbox: string, tags: Array<string>): string {
            let element_types = ["relation", "way", "node"];
            let query = "[out:json][maxsize:1073741824];(";
    
            for (let tag of tags) {
                query += "(";
                for (let element_type of element_types) {
                    query += `${element_type}${bbox}${tag}; `;
                }
                query += "); ";
            }
    
            query += "); out body; >; out body;";
            return query;
        }
    }


    RED.nodes.registerType("osm-overpass-download", OverpassDownload);
}
