import axios, { AxiosResponse } from 'axios'
import { AbstractGeocoderBackend } from './AbstractGeocoderBackend';
import * as jszip from 'jszip'

export class HereBatchGeocoderBackend extends AbstractGeocoderBackend {

    requestId: string | null = null

    endpointBaseUrl = "https://batch.geocoder.ls.hereapi.com/6.2/"

    constructor(public baseUrl: string, public apiKey: string) {
        super();
    }


    async geocode(geojson_in: any, query_field_name: string): Promise<any> {

        //############### BEGIN Construct geocoding request URL #################
        let urlObj = new URL(this.endpointBaseUrl + "jobs");

        urlObj.searchParams.append("apiKey", this.apiKey)
        urlObj.searchParams.append("indelim", "|")
        urlObj.searchParams.append("outdelim", "|")
        urlObj.searchParams.append("action", "run")
        urlObj.searchParams.append("outcols", "displayLatitude,displayLongitude,locationLabel,houseNumber,street,district,city,postalCode,county,state,country")
        urlObj.searchParams.append("outputcombined", "false")
        //############### END Construct geocoding request URL #################


        //#################### BEGIN Construct geocoding request body ####################

        let requestBody = ""

        let featureIndex = -1

        requestBody += "recId|searchText\n"

        for (let feature of geojson_in.features) {

            featureIndex++

            let query = ""

            if (query_field_name in feature.properties) {
                query = feature.properties[query_field_name]
            }

            requestBody += featureIndex + "|" + query + "\n"
        }


        /*        
        requestBody += "recId|searchText|country\n"
        requestBody += "0001|Invalidenstraße 116 10115 Berlin|DEU\n"
        requestBody += "0002|Am Kronberger Hang 8 65824 Schwalbach|DEU\n"
        requestBody += "0003|425 W Randolph St Chicago IL 60606|USA\n"
        requestBody += "0004|One Main Street Cambridge MA 02142|USA\n"
        requestBody += "0005|200 S Mathilda Ave Sunnyvale CA 94086|USA"
        */


        //#################### END Construct geocoding request body ####################



        let response = await axios.post(urlObj.toString(), requestBody, { headers: { 'Content-Type': 'application/text' } }).catch((e) => {
            //this.status(new NodeStatus("Error during geocoding request: " + e))
            console.log("Fehlerchen!: " + e);

            return new Promise((resolve, reject) => {
                reject("Fehlerchen: " + e)
            })

        }) as AxiosResponse;

        if (response == undefined) {
            //this.status(new NodeStatus("Error during geocoding request. Skipping data row."));
            console.log("Fehlerchen!");


            return new Promise((resolve, reject) => {
                reject("Fehlerchen")
            })
        }

        let status = response.data.Response.Status

        if (status != "accepted") {

            return new Promise((resolve, reject) => {
                reject("Fehlerchen")
            })

        }

        this.requestId = response.data.Response.MetaInfo.RequestId

        if (this.requestId == null) {
            return
        }


        let requestId = this.requestId

        //######## BEGIN Query geocoding API for job status until completed, then fetch result. #####
        while (true) {
            await this.sleep(2000)


            let status = await this.getJobStatus(requestId)

            console.log("Check status: " + status)

            if (status == "completed") {

                let result = await this.getJobResult(requestId) as any

                var buf = Buffer.from(result, "binary");

                let zip = await jszip.loadAsync(buf)

                let geojson_out = JSON.parse(JSON.stringify(geojson_in))


                // NOTE: There should be only one file in the zip archive.
                for (let key in zip.files) {

                    let content_buffer = await zip.file(key)!!.async('nodebuffer')

                    let content = content_buffer.toString()

                    console.log(content)
                    let lines = content.split("\n")

                    // ATTENTION: The first line of the result file is the header, so we must start at line 1:
                    let lineIndex = 1

                    // NOTE: This works because the order of the features in the input GeoJSON is the same as
                    // in the batch geocoding results file.
                    for (let feature of geojson_out.features) {
                        

                        let line = lines[lineIndex]

                        let row = line.split("|")
                        //console.log(row)

                        let lat = parseFloat(row[3])
                        let lon = parseFloat(row[4])


                        let geometry = { "type": "Point", "coordinates": [lon, lat] }

                        feature.geometry = geometry

                        // Proceed to next line:
                        lineIndex++

                    }

                    return new Promise((resolve, reject) => { resolve(geojson_out)})
                }

                return

            }
            else if (status == "accepted" || status == "running") {
                // Nothing to do in this case
            }
            else {
                console.log("Unexpected job status: " + status)
                return null
            }
        }
        //######## END Query geocoding API for job status until completed, then fetch result. #####
    }



    async getJobStatus(requestId: string): Promise<any> {


        let urlObj = new URL(this.endpointBaseUrl + "jobs/" + requestId);

        urlObj.searchParams.append("apiKey", this.apiKey)
        urlObj.searchParams.append("action", "status")

        let response = await axios.get(urlObj.toString()).catch((e) => {

            console.log("Fehlerchen!: " + e);

            return new Promise((resolve, reject) => {
                reject("Fehlerchen")
            })

        }) as AxiosResponse;


        if (response == undefined) {

            console.log("Fehlerchen!");

            return new Promise((resolve, reject) => {
                reject("Fehlerchen")
            })
        }



        return new Promise((resolve, reject) => {
            resolve(response.data.Response.Status)
        })
    }


    async getJobResult(requestId: string) {
        //https://batch.geocoder.ls.hereapi.com/6.2/jobs/E2bc948zBsMCG4QclFKCq3tddWYCsE9g/result?apiKey={YOUR_API_KEY}

        let urlObj = new URL(this.endpointBaseUrl + "jobs/" + requestId + "/result");

        urlObj.searchParams.append("apiKey", this.apiKey)


        let response = await axios.get(urlObj.toString(), {
            responseType: 'arraybuffer'
        }).catch((e) => {

            console.log("Fehlerchen!: " + e);

            return new Promise((resolve, reject) => {
                reject("Fehlerchen")
            })

        }) as AxiosResponse;


        if (response == undefined) {

            console.log("Fehlerchen!");

            return new Promise((resolve, reject) => {
                reject("Fehlerchen")
            })

        }


        return new Promise((resolve, reject) => {
            resolve(response.data)
        })
    }


    sleep(ms: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

}