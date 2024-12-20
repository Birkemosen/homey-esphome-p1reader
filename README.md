# homey-esphome-p1reader

This is a Homey app that reads data from an ESPHome device based on [psvanstrom/esphome-p1reader](https://github.com/psvanstrom/esphome-p1reader).


# Development Environment

To develop on this app, you can use the Dev Container in this repository. This will provide you with a development environment that matches the one used in the [Homey App Store](https://homey.app/en-gb/developers/apps/).

[Getting Started](https://apps.developer.homey.app/the-basics/getting-started)

Install the dependencies:

```bash
npm install --global --no-optional homey
```

Make sure to add the HOMEY_PAT secret to your GitHub repository, the personal access token can be found at https://tools.developer.homey.app/me.

# Exposed Sensors

sensors:
      meter_sensor->cumulativeActiveImport,
      meter_sensor->cumulativeActiveExport,
      # meter_sensor->cumulativeReactiveImport,
      # meter_sensor->cumulativeReactiveExport,
      meter_sensor->momentaryActiveImport,
      meter_sensor->momentaryActiveExport,
      # meter_sensor->momentaryReactiveImport,
      # meter_sensor->momentaryReactiveExport,
      meter_sensor->momentaryActiveImportL1,
      meter_sensor->momentaryActiveExportL1,
      meter_sensor->momentaryActiveImportL2,
      meter_sensor->momentaryActiveExportL2,
      meter_sensor->momentaryActiveImportL3,
      meter_sensor->momentaryActiveExportL3,
      # meter_sensor->momentaryReactiveImportL1,
      # meter_sensor->momentaryReactiveExportL1,
      # meter_sensor->momentaryReactiveImportL2,
      # meter_sensor->momentaryReactiveExportL2,
      # meter_sensor->momentaryReactiveImportL3,
      # meter_sensor->momentaryReactiveExportL3,
      meter_sensor->voltageL1,
      meter_sensor->voltageL2,
      meter_sensor->voltageL3,
      meter_sensor->currentL1,
      meter_sensor->currentL2,
      meter_sensor->currentL3