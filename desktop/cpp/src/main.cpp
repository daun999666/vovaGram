#include <QApplication>
#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QMessageBox>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcess>
#include <QStandardPaths>
#include <QTimer>
#include <QUrl>
#include <QWebEngineView>
#include <QMainWindow>

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    QApplication::setApplicationName("vovchikGram");
    QApplication::setOrganizationName("vovchikGram");

    auto *window = new QMainWindow();
    auto *view = new QWebEngineView(window);
    window->setCentralWidget(view);
    window->resize(1280, 820);
    window->setMinimumSize(900, 620);
    window->setWindowTitle("vovchikGram");

    auto *server = new QProcess(&app);
    const QString appDir = QCoreApplication::applicationDirPath();
    const QString packagedServer = QDir(appDir).filePath("vovchikgram-server.exe");
    const QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dataDir);

    if (QFileInfo::exists(packagedServer)) {
        server->setWorkingDirectory(dataDir);
        server->start(packagedServer, {"--port", "8787"});
    } else {
        const QString projectDir = QDir::currentPath();
        const QString serverJs = QDir(projectDir).filePath("server.js");
        const QString node = QStandardPaths::findExecutable("node");
        if (QFileInfo::exists(serverJs) && !node.isEmpty()) {
            server->setWorkingDirectory(projectDir);
            server->start(node, {serverJs});
        } else {
            QMessageBox::critical(window, "vovchikGram",
                "Не найден встроенный сервер. Переустанови приложение или используй dev-запуск из папки проекта.");
            return 1;
        }
    }

    auto *network = new QNetworkAccessManager(window);
    auto *healthTimer = new QTimer(window);
    healthTimer->setInterval(350);
    QObject::connect(healthTimer, &QTimer::timeout, window, [=]() {
        auto *reply = network->get(QNetworkRequest(QUrl("http://127.0.0.1:8787/api/health")));
        QObject::connect(reply, &QNetworkReply::finished, window, [=]() {
            const bool ready = reply->error() == QNetworkReply::NoError;
            reply->deleteLater();
            if (ready) {
                healthTimer->stop();
                view->setUrl(QUrl("http://127.0.0.1:8787"));
            }
        });
    });
    healthTimer->start();

    QObject::connect(server, &QProcess::errorOccurred, window,
        [window](QProcess::ProcessError) {
            QMessageBox::critical(window, "vovchikGram",
                "Не удалось запустить встроенный сервер приложения.");
        });
    window->show();
    QObject::connect(&app, &QCoreApplication::aboutToQuit, server, [server]() {
        server->terminate();
        if (!server->waitForFinished(2500)) server->kill();
    });
    return app.exec();
}
