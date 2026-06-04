import re

content = open('c:/Users/Kobus Liebenberg/Music/05_JUPITER/backup _004/ESHU_0.1.2/pages/home.html', 'r', encoding='utf-8').read()
content = re.sub(r'<button class="tab-btn" data-tab="groups">Groups</button>', '', content)
content = re.sub(r'<button class="tab-btn" data-tab="games">Games</button>', '', content)
open('c:/Users/Kobus Liebenberg/Music/05_JUPITER/backup _004/ESHU_0.1.2/pages/home.html', 'w', encoding='utf-8').write(content)
print('Done')
