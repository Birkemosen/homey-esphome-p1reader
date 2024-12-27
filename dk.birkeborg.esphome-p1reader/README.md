# ESPHome P1 Reader

Adds support for ESPHome P1 Reader based on psvanstrom/esphome-p1reader.

# Exposed Sensors

sensors:
      meter_sensor->cumulativeActiveImport,
      meter_sensor->cumulativeActiveExport,
      meter_sensor->momentaryActiveImport,
      meter_sensor->momentaryActiveExport,
      meter_sensor->momentaryActiveImportL1,
      meter_sensor->momentaryActiveExportL1,
      meter_sensor->momentaryActiveImportL2,
      meter_sensor->momentaryActiveExportL2,
      meter_sensor->momentaryActiveImportL3,
      meter_sensor->momentaryActiveExportL3,
      meter_sensor->voltageL1,
      meter_sensor->voltageL2,
      meter_sensor->voltageL3,
      meter_sensor->currentL1,
      meter_sensor->currentL2,
      meter_sensor->currentL3