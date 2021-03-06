var request = require('request');
var fs = require('fs');

var MS_PER_MINUTE = 60000;

main = () => {
    let tablesPromise = Promise.resolve("");
    let url = config.url + "/api-manager/api/v3/apis?privateAPI=false";
    getRequest(url, headers, 200)
        .then(apis => {
            apis.forEach(api => {
                tablesPromise = tablesPromise.then(tables => apiErrorRateCheck(api.id, api.name, tables).catch(() => tables));
            });
        })
        .then(() => {
            tablesPromise
                .then(tables => writeEmail(tsRangeInit, tsRangeEnd, tables))
                .catch(error => console.log(error));
        });
}

postRequest = (url, headers, body, acceptedStatus) => {
    let options = { url: url, headers: headers, body: body, method: "POST" };
    return new Promise(
        (resolve, reject) => {
            request.post(options, (error, response, body) => {
                if (error) {
                    let failFact = { error: error, statusCode: null };
                    reject(failFact)
                } else {
                    if (response.statusCode != acceptedStatus) {
                        console.log("status code1: " + response.statusCode);
                        let failFact = { error: error, statusCode: response.statusCode };
                        reject(failFact);
                    } else {
                        let fact = JSON.parse(body);
                        resolve(fact);
                    }
                }
            });
        }
    );
}

getRequest = (url, headers, acceptedStatus) => {
    let options = { url: url, headers: headers, method: "GET" };
    return new Promise(
        (resolve, reject) => {
            request.get(options, (error, response, body) => {
                if (error) {
                    let failFact = { error: error, statusCode: null };
                    reject(failFact)
                } else {
                    if (response.statusCode != acceptedStatus) {
                        console.log("status code1: " + response.statusCode);
                        let failFact = { error: error, statusCode: response.statusCode };
                        reject(failFact);
                    } else {
                        let fact = JSON.parse(body);
                        resolve(fact);
                    }
                }
            });
        }
    );
}

rateCheck = (errorCount, totalCount, acceptedThreshold) => {
    if (!totalCount || totalCount == 0) {
        console.log("Nenhuma chamada executada!");
    }
    if ((errorCount / totalCount) > acceptedThreshold) {
        console.log("Total erros: " + errorCount + " - Percentual: " + (errorCount / totalCount));
        return true;
    }
    console.log("Nenhum erro detectado.");
    return false;
}

apiErrorRateCheck = (apiId, apiName, tables) => {

    var queryTotalErrors = {
        "size": 0,
        "query": {
            "filtered": {
                "query": {
                    "query_string": {
                        "query": "apiId:" + apiId + " AND environmentName: " + config.environment + "",
                        "analyze_wildcard": true
                    }
                },
                "filter": {
                    "bool": {
                        "must": [
                            {
                                "range": {
                                    "receivedOnDate": {
                                        "gte": tsRangeInit,
                                        "lte": tsRangeEnd,
                                        "format": "epoch_millis"
                                    }
                                }
                            }
                        ],
                        "must_not": []
                    }
                }
            }
        },
        "aggs": {
            "2": {
                "filters": {
                    "filters": {
                        "client_errors": {
                            "query": {
                                "query_string": {
                                    "query": "typeStatus: error AND resultStatus: [400 TO 500}",
                                    "analyze_wildcard": true
                                }
                            }
                        },
                        "server_errors": {
                            "query": {
                                "query_string": {
                                    "query": "typeStatus: error AND resultStatus: [500 TO *}",
                                    "analyze_wildcard": true
                                }
                            }
                        },
                        "total_calls": {
                            "query": {
                                "query_string": {
                                    "query": "*",
                                    "analyze_wildcard": true
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    var queryErroByOperation = {
        "size": 0,
        "query": {
            "filtered": {
                "query": {
                    "query_string": {
                        "query": "*",
                        "analyze_wildcard": true
                    }
                },
                "filter": {
                    "bool": {
                        "must": [
                            {
                                "range": {
                                    "receivedOnDate": {
                                        "gte": tsRangeInit,
                                        "lte": tsRangeEnd,
                                        "format": "epoch_millis"
                                    }
                                }
                            }
                        ],
                        "must_not": []
                    }
                }
            }
        },
        "aggs": {
            "2": {
                "filters": {
                    "filters": {
                        "operations": {
                            "query": {
                                "query_string": {
                                    "query": "apiId:" + apiId
                                        + " AND resultStatus:[400 TO 599]"
                                        + " AND environmentName: " + config.environment,
                                    "analyze_wildcard": true
                                }
                            }
                        }
                    }
                },
                "aggs": {
                    "3": {
                        "terms": {
                            "field": "operationName",
                            "size": 0,
                            "order": {
                                "_count": "desc"
                            }
                        },
                        "aggs": {
                            "4": {
                                "terms": {
                                    "field": "resultStatus",
                                    "size": 0,
                                    "order": {
                                        "_count": "desc"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    let url = config.url + "/api-metrics/api/v3/trace/search";

    var totalCalls = 0;
    var clientErrors = 0;
    var serverErrors = 0;

    return postRequest(url, headers, JSON.stringify(queryTotalErrors), 200)
        .then((body) => {
            totalCalls = body["aggregations"]["2"]["buckets"]["total_calls"]["doc_count"]
            clientErrors = body["aggregations"]["2"]["buckets"]["client_errors"]["doc_count"]
            serverErrors = body["aggregations"]["2"]["buckets"]["server_errors"]["doc_count"]
            console.log("Total de chamadas " + totalCalls + " e total de erros " + clientErrors);
            return new Promise((resolve, reject) => {
                if (rateCheck(clientErrors, totalCalls, config.client_error_accepted_percentage)
                    || rateCheck(serverErrors, totalCalls, config.server_error_accepted_percentage)) {
                    resolve();
                } else {
                    reject();
                }
            });
        })
        .then(() => {
            console.log("Too many errors!");
            return postRequest(url, headers, JSON.stringify(queryErroByOperation), 200);
        })
        .then(body => {
            console.log("Preparando envio de e-mail de erros.");
            return apiErrorTable(apiName, clientErrors, serverErrors, totalCalls, body);
        })
        .then(table => {
            return tables + table;
        });
}

apiErrorTable = (apiName, clientErrors, serverErrors, totalCalls, errorByOperation) => {
    var apiTablesHTML =
        "<hr>" +
        "<h2>{{apiName}}</h2>" +
        "<br>Total de chamadas da {{apiName}}: {{totalCalls}}" +
        "<br>Total de chamadas da {{apiName}} com erros <b>4xx</b>: {{clientErrors}}" +
        "<br>Total de chamadas da {{apiName}} com erros <b>5xx</b>: {{serverErrors}}" +
        "<br>Total de chamadas da {{apiName}} com erros: {{totalErrors}}" +
        "<br>Sendo:" +
        "<br>" +
        "<table border='1' cellpadding='0' cellspacing='0'>" +
        "    <tr>" +
        "        <th width='50%'>Operacao</th>" +
        "        <th width='10%'>HTTP Status</th>" +
        "        <th width='30%'>Descricao</th>" +
        "        <th width='10%'>Quantidade</th>" +
        "    </tr>" +
        "{{rows}}" +
        "</table>";

    let row =
        "    <tr>" +
        "        <td>{{operationName}}</td>" +
        "        <td align='center'>" +
        "            <a href='https://httpstatuses.com/{{statusKey}}'>{{statusKey}}</a>" +
        "        </td>" +
        "        <td>{{statusDescription}}</td>" +
        "        <td align='center'>{{statusCounter}}</td>" +
        "    </tr>";
    var rows = "";
    let operations = errorByOperation["aggregations"]["2"]["buckets"]["operations"]["3"]["buckets"]
    operations.sort((o1, o2) => o1.key < o2.key).forEach((op, idx) => {
        let opname = op["key"];
        op["4"]["buckets"].sort((o1, o2) => o1.key < o2.key).forEach((status) => {
            let formatted = row.replace(/{{operationName}}/g, opname);
            formatted = formatted.replace(/{{statusKey}}/g, status["key"]);
            formatted = formatted.replace(/{{statusDescription}}/g, mapHttpStatus[status["key"]]);
            formatted = formatted.replace(/{{statusCounter}}/g, status["doc_count"]);
            rows += formatted;
        });
    });
    apiTablesHTML = apiTablesHTML.replace(/{{apiName}}/g, apiName);
    apiTablesHTML = apiTablesHTML.replace(/{{totalCalls}}/g, totalCalls);
    apiTablesHTML = apiTablesHTML.replace(/{{clientErrors}}/g, clientErrors);
    apiTablesHTML = apiTablesHTML.replace(/{{serverErrors}}/g, serverErrors);
    apiTablesHTML = apiTablesHTML.replace(/{{totalErrors}}/g, clientErrors + serverErrors);
    apiTablesHTML = apiTablesHTML.replace(/{{rows}}/g, rows);

    return apiTablesHTML;
}

writeEmail = (tsInit, tsEnd, tables) => {
    var emailBody =
        "Resumo de erros no período " +
        "<b>{{dateInit}} a {{dateEnd}} </b>" +
        tables +
        "<br>" +
        "<br>Sensedia - JOB de Monitoramento";

    emailBody = emailBody.replace(/{{dateInit}}/g, new Date(tsInit).toISOString());
    emailBody = emailBody.replace(/{{dateEnd}}/g, new Date(tsEnd).toISOString());
    emailBody = emailBody.replace(/{{monitorWindowMinutes}}/g, config.monitor_window_minutes);

    fs.writeFile('arquivo.txt', emailBody, function (err) {
        if (err) throw err;
        console.log('Saved!');
    });
}

// BEGIN MAIN

var config = JSON.parse(fs.readFileSync('configure.json', 'utf8'));

var tsRangeEnd = Date.now();
var tsRangeInit = new Date(tsRangeEnd - config.monitor_window_minutes * MS_PER_MINUTE).getTime();

var headers = {
    "Accept": "*/*",
    "Sensedia-Auth": config.sensedia_auth
};

var mapHttpStatus = JSON.parse(fs.readFileSync('httpstatus.json', 'utf8'));

main();