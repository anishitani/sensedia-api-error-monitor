# sensedia-api-error-monitor
Jenknis setup for monitoring errors in the API Gateway.

# Requirements
The script is written in NodeJS and it makes use of external libraries `request` and `argparse`.

# Running the script
Run the script with the following command `node sensedia-api-error-monitor.js -h` to get help and instructions of usage.

The script accepts the following parameters:
- `--auth` is the SensediaAuth token, used for accessing API metrics
- `--url` address of Sensedia's API Manager
- `--environment` filter for environment
- `--window` time window for monitoring errors
- `--client_error` accepted pecentage of client errors
- `--server_error` accepted pecentage of server errors
- `--config` JSON file containing the configuratons
``` json
{
    "sensedia_auth": "97f9c90d-a5f3-45d9-a9e3-611deb4863ba",
    "url": "https://manager-example.sensedia.com",
    "environment": "Sandbox",
    "monitor_window_minutes": "30",
    "client_error_accepted_percentage": "0.3",
    "server_error_accepted_percentage": "0.03"
}
```

When defined, the configuration file will discard the other configuration. Therefore, the use of configuration file and arguments are excluisive.

# Docker container
The repository commit spins a Docker image build and the image can be used as a binary using the following command:
- `docker run anishitani/sensedia-api-error-monitor -h`

The same arguments from the scripted approach are applied to the containerized version.