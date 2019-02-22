import { // eslint-disable-line import/no-extraneous-dependencies,import/no-unresolved
    SmartChart,
    ChartTypes,
    StudyLegend,
    Comparison,
    Views,
    CrosshairToggle,
    Timeperiod,
    ChartSize,
    DrawTools,
    ChartSetting,
    createObjectFromLocalStorage,
    setSmartChartsPublicPath,
    Share,
    ChartTitle,
    AssetInformation,
    ComparisonList,
    logEvent,
    LogCategories,
    LogActions,
} from '@binary-com/smartcharts'; // eslint-disable-line import/no-unresolved
import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import 'url-search-params-polyfill';
import { configure } from 'mobx';
import './app.scss';
import { whyDidYouUpdate }  from 'why-did-you-update';
import { BinaryAPI, ActiveSymbols, TradingTimes } from './binaryapi';
import { ConnectionManager, StreamManager } from './connection';
import Notification from './Notification.jsx';
import ChartNotifier from './ChartNotifier.js';
import ChartHistory from './ChartHistory.jsx';

setSmartChartsPublicPath('./dist/');

const isMobile = window.navigator.userAgent.toLowerCase().includes('mobi');

if (process.env.NODE_ENV !== 'production') {
    whyDidYouUpdate(React, { exclude: [/^RenderInsideChart$/, /^inject-/] });
}

const trackJSDomains = ['binary.com', 'binary.me'];
window.isProductionWebsite = trackJSDomains.reduce((acc, val) => (acc || window.location.host.endsWith(val)), false);

if (window.isProductionWebsite) {
    window._trackJs = { token: '346262e7ffef497d85874322fff3bbf8', application: 'smartcharts' };
    const s = document.createElement('script');
    s.src = 'https://cdn.trackjs.com/releases/current/tracker.js';
    document.body.appendChild(s);
}

/* // PWA support is temporarily removed until its issues can be sorted out
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${window.location.origin + window.location.pathname}sw.js`)
        .then(() => {
            console.log('Service Worker Registered');
        }).catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
        });
}
*/

configure({ enforceActions: 'observed' });

function getLanguageStorage() {
    const default_language = 'en';
    try {
        const setting_string = localStorage.getItem('smartchart-setting'),
            setting = JSON.parse(setting_string !== '' ? setting_string : '{}');

        return setting.language || default_language;
    } catch (e) {
        return default_language;
    }
}

function getServerUrl() {
    const local = localStorage.getItem('config.server_url');
    return `wss://${local || 'ws.binaryws.com'}/websockets/v3`;
}

const chartId = '1';
const appId  = localStorage.getItem('config.app_id') || 12812;
const serverUrl = getServerUrl();
const language = new URLSearchParams(window.location.search).get('l') || getLanguageStorage();
const today = moment().format('YYYY/MM/DD 00:00');
const connectionManager = new ConnectionManager({
    appId,
    language,
    endpoint: serverUrl,
});
const IntervalEnum = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 24 * 3600,
    year: 365 * 24 * 3600,
};

const streamManager = new StreamManager(connectionManager);
const requestAPI = connectionManager.send.bind(connectionManager);
const requestSubscribe = streamManager.subscribe.bind(streamManager);
const requestForget = streamManager.forget.bind(streamManager);


class App extends Component {
    startingLanguage = 'en';

    constructor(props) {
        super(props);
        this.notifier = new ChartNotifier();
        this.api = new BinaryAPI(requestAPI, requestSubscribe, requestForget);
        this.tradingTimes = new TradingTimes(this.api);
        this.activeSymbols = new ActiveSymbols(this.api, this.tradingTimes);

        const layoutString = localStorage.getItem(`layout-${chartId}`),
            layout = JSON.parse(layoutString !== '' ? layoutString : '{}');
        let chartType;
        let isChartTypeCandle;
        let granularity;
        let endEpoch;
        let settings = createObjectFromLocalStorage('smartchart-setting');
        let symbol;

        if (layout && layout.symbols[0]) {
            symbol = layout.symbols[0].symbol;
        }

        if (settings) {
            settings.language = language;
            this.startingLanguage = settings.language;
        } else {
            settings = { language };
        }
        if (settings.historical) {
            this.removeAllComparisons();
            endEpoch = (new Date(`${today}:00Z`).valueOf() / 1000);
            chartType = 'mountain';
            isChartTypeCandle = false;
            granularity = 0;
            if (layout) {
                granularity = layout.timeUnit === 'second' ? 0 : parseInt(layout.interval * IntervalEnum[layout.timeUnit], 10);

                if (layout.chartType === 'candle' && layout.aggregationType !== 'ohlc') {
                    chartType = layout.aggregationType;
                } else {
                    chartType = layout.chartType;
                }

                if (['mountain', 'line', 'colored_line', 'spline', 'baseline'].indexOf(chartType) === -1) {
                    isChartTypeCandle = true;
                }
            }
        }

        connectionManager.on(
            ConnectionManager.EVENT_CONNECTION_CLOSE,
            () => this.setState({ isConnectionOpened: false }),
        );
        connectionManager.on(
            ConnectionManager.EVENT_CONNECTION_REOPEN,
            () => this.setState({ isConnectionOpened: true }),
        );
        this.state = {
            settings,
            endEpoch,
            chartType,
            isChartTypeCandle,
            granularity,
            isConnectionOpened: true,
            diffTime: 0,
            symbol,
        };
    }

    /**
     * Find diference of clinet time and server time,
     * to use for historical data endMoment
     */
    componentDidMount() {
        const currentTime = moment().utc().unix();
        this.api.getServerTime()
            .then((x) => {
                this.setState({
                    diffTime: (currentTime - x.time),
                });
            });
    }

    /*
    shouldComponentUpdate(nextProps, nextState) {
        return this.state.symbol !== nextState.symbol
            || JSON.stringify(this.state.settings) !== JSON.stringify(nextState.settings);
    }
    */
    removeAllComparisons = () => {
        try {
            const layoutString = localStorage.getItem(`layout-${chartId}`),
                layout = JSON.parse(layoutString !== '' ? layoutString : '{}');

            layout.symbols.splice(1, layout.symbols.length - 1);
            localStorage.setItem(`layout-${chartId}`, JSON.stringify(layout));
        } catch (e) {
            console.log(e);
        }
    }

    symbolChange = (symbol) => {
        logEvent(LogCategories.ChartTitle, LogActions.MarketSelector, symbol);
        this.notifier.removeByCategory('activesymbol');

        this.setState({ symbol });
    };

    saveSettings = (settings) => {
        const prevSetting = this.state.settings;
        console.log('settings updated:', settings);
        localStorage.setItem('smartchart-setting', JSON.stringify(settings));


        if (!prevSetting.historical && settings.historical) {
            this.setState({
                chartType: 'mountain',
                isChartTypeCandle: false,
                granularity: 0,
                endEpoch: (new Date(`${today}:00Z`).valueOf() / 1000),
            });
            this.removeAllComparisons();
        } else if (!settings.historical) {
            this.handleDateChange('');
        }

        this.setState({ settings });
        if (this.startingLanguage !== settings.language) {
            // Place language in URL:
            const { origin, search, pathname } = window.location;
            const url = new URLSearchParams(search);
            url.delete('l');
            url.set('l', settings.language);
            window.location.href = `${origin}${pathname}?${url.toString()}`;
        }
    };

    handleDateChange = (value) => {
        const endEpoch = (value !== '') ? (new Date(`${value}:00Z`).valueOf() / 1000) : undefined;
        this.setState({ endEpoch });
    };

    renderTopWidgets = () => (
        <>
            <ChartTitle onChange={this.symbolChange} />
            {this.state.settings.historical ? (
                <ChartHistory
                    diffTime={this.state.diffTime}
                    symbol={this.state.symbol}
                    tradingAPI={this.tradingTimes}
                    onChange={this.handleDateChange}
                />
            ) : ''}
            <AssetInformation />
            <ComparisonList />
            <Notification
                notifier={this.notifier}
            />
        </>
    );

    renderControls = () => (
        <>
            {isMobile ? '' : <CrosshairToggle />}
            <ChartTypes
                onChange={(chartType, isChartTypeCandle) => {
                    this.setState({
                        chartType,
                        isChartTypeCandle,
                    });
                }}
            />
            <Timeperiod
                onChange={(timePeriod) => {
                    this.setState({
                        granularity: timePeriod,
                    });
                    const isCandle = this.state.isChartTypeCandle;
                    if (isCandle && timePeriod === 0) {
                        this.setState({
                            chartType: 'mountain',
                            isChartTypeCandle: false,
                        });
                    } else if (!isCandle && timePeriod !== 0) {
                        this.setState({
                            chartType: 'candle',
                            isChartTypeCandle: true,
                        });
                    }
                }}
            />
            <StudyLegend />
            {this.state.settings.historical ? '' : <Comparison />}
            <DrawTools />
            <Views />
            <Share />
            {isMobile ? '' : <ChartSize />}
            <ChartSetting />
        </>
    );

    onMessage = (e) => {
        this.notifier.notify(e);
    }

    render() {
        const { settings, isConnectionOpened, symbol, endEpoch } = this.state;

        return (
            <SmartChart
                id={chartId}
                symbol={symbol}
                isMobile={isMobile}
                onMessage={this.onMessage}
                enableRouting
                removeAllComparisons={settings.historical}
                topWidgets={this.renderTopWidgets}
                chartControlsWidgets={this.renderControls}
                requestAPI={requestAPI}
                requestSubscribe={requestSubscribe}
                requestForget={requestForget}
                settings={settings}
                endEpoch={endEpoch}
                chartType={this.state.chartType}
                granularity={this.state.granularity}
                onSettingsChange={this.saveSettings}
                isConnectionOpened={isConnectionOpened}
            />
        );
    }
}

ReactDOM.render(
    <App />,
    document.getElementById('root'),
);
