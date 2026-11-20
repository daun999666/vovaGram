cmake_minimum_required(VERSION 3.21)
project(vovchikGramDesktop VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.5 REQUIRED COMPONENTS Widgets WebEngineWidgets)

qt_add_executable(vovchikGram
    src/main.cpp
)

target_link_libraries(vovchikGram PRIVATE
    Qt6::Widgets
    Qt6::WebEngineWidgets
)

if(WIN32)
    set_target_properties(vovchikGram PROPERTIES WIN32_EXECUTABLE TRUE)
endif()
