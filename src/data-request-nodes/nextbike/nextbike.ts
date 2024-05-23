import { AbstractNode } from "node-red-typescript-essentials/AbstractNode";
import { NodeStatus } from "node-red-typescript-essentials/node_status";
import axios, { AxiosResponse } from "axios";
import * as moment from "moment";

// Out: GeoJSON object as payload
module.exports = function (RED: any) {
  class NextbikeNodeConfig {
    constructor(public api_url: string) {}
  }

  class NextbikeNode extends AbstractNode {
    constructor(public config: NextbikeNodeConfig) {
      super(config, RED);

      this.on("input", this.onInput);
    }

    async onInput(msg: any, send: any, done: any) {
      try {
        this.status(new NodeStatus("Loading..."));

        let geoJSON = { "type": "FeatureCollection", "features": Array<any>() };

        let response = (await axios.get(this.config.api_url).catch((error) => {
          console.log(error);
          throw "Download failed";
        })) as AxiosResponse;

        if (response == undefined) {
          throw "Download failed, response is undefined";
        }
        let vrnnextbike = null;

        if (!("countries" in response.data) || !(response.data.countries instanceof Array)) {
          throw "nextbike-request: countries no longer in response or no longer an array, please check";
        }

        for (let country of response.data.countries) {
          if ("name" in country && country.name == "VRNnextbike" && "cities" in country) {
            vrnnextbike = country.cities;
            break;
          }
        }

        if (vrnnextbike == null || !(vrnnextbike instanceof Array)) {
          throw "nextbike-request: response structure changed, vrnnextbike not found please check";
        }

        let propLength: number = 0;

        for (let city of vrnnextbike) {
          if (!("places" in city)) {
            throw "nextbike-request: resoinse structure changed, places no longer a key in city";
          }
          for (let station of city.places) {
            let properties: any = {};
            if ("name" in city) {
              properties["Stadt"] = city["name"];
            }
            if ("name" in station) {
              properties["Name"] = station["name"];
            }
            if ("bike_racks" in station) {
              properties["Anzahl der Bügel"] = station["bike_racks"];
            }
            if ("bikes" in station) {
              properties["Verfügbare Fahrräder"] = station["bikes"];
            }

            var date = new Date();
            var formattedDate = moment(date).format("DD.MM.YYYY, HH:mm");
            properties["Zuletzt aktualisiert:"] = formattedDate;

            if (!("lng" in station) || !("lat" in station)) {
              continue;
            }

            let feature = {
              "type": "Feature",
              "properties": properties,
              "geometry": {
                "type": "Point",
                "coordinates": [station["lng"], station["lat"]],
              },
            };
            geoJSON["features"].push(feature);
            propLength += Object.keys(feature.properties).length;
          }
        }

        if (geoJSON.features.length == 0) {
          throw "nextbike-request: no features in geojson key values probably changed.";
        }

        if (propLength / geoJSON.features.length < 2) {
          throw "nextbike-request: average number of properties is small, keys likely changed, please check";
        }

        msg.payload = JSON.parse(JSON.stringify(geoJSON));
        send(msg);

        let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully saved" };
        this.status(info);
        done();
      } catch (e) {
        let info: any = { fill: "red", shape: "dot", text: "Stopped because of error" };
        this.status(info);
        done(e);
      }
    }
  }

  RED.nodes.registerType("Nextbike", NextbikeNode);
};
