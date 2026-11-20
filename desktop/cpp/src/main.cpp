#include <QApplication>
#include <QDir>
#include <QFileInfo>
#include <QMessageBox>
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
    window->setWindowTitle("vovchikGram");

    auto *server = new QProcess(&app);
    const QString projectDir = QDir::currentPath();
    const QString serverJs = QDir(projectDir).filePath("server.js");
    const QString node = QStandardPaths::findExecutable("node");

    if (QFileInfo::exists(serverJs) && !node.isEmpty()) {
        server->setWorkingDirectory(projectDir);
        server->start(node, {serverJs});
    }

    view->setUrl(QUrl("http://127.0.0.1:8787"));
    QObject::connect(server, &QProcess::errorOccurred, window,
        [window](QProcess::ProcessError) {
            QMessageBox::warning(window, "vovchikGram",
                "Не удалось запустить Node.js сервер. Для dev-сборки запустите npm start в папке проекта.");
        });

    window->show();
    QObject::connect(&app, &QCoreApplication::aboutToQuit, server, &QProcess::terminate);
    return app.exec();
}
