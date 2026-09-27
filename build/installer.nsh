!define APPNAME "خضرة"
!define COMPANYNAME "Khodra"
!define DESCRIPTION "إدارة متجر خضروات وفواكه"

RequestExecutionLevel user
InstallDir "$PROGRAMFILES64\Khodra"

Page directory
Page instfiles

Section "Main"
  SetOutPath $INSTDIR
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd
