
suppose those situations:
## case 1
- assigned shift is 8 AM ( 7 to 10 am is acceptable check-in time ) to 5 PM (4 to 6 pm is acceptable check-out time )
- break time is 1 hour (1 PM to 2 PM)
- acceptable late punch is 20 minute
NOW :
# test 1
if he punch at 8.10 am , it is acceptable but to fill 8 hours, does he need to punch out at 5.10 pm ? if he punch at 5pm, what will happen? how many hours will be calucated/accepted ? full 8 hours or the 10 minutes lower ?

the launch break 1 hour are we excluding this from working time ?

if user dont come back after launch or suppose leave at 12 pm or 3 pm, are we taking the worked time properly or not ?

## case 2
if he does so much overtime, i mean entered 8am and leave at 10pm, what will happen? if admin want to take the extra time as overtime , can he do this ?

answer me 

i think we should have some corrections :
- if  the punch quantity of a day is odd i mean 1, 3, 5, etc. then it should be detected as problemed/corruped day and admin need to fix
- this way, if user do massive overtime that's why his last punch is after the range, it also will be corrupted due to odd punch because the last punch is at out of time. and admin need to manually handle this 
- instead of direct deduct 1 hour for luanch break based on connected shift, should we check the in out situation ? like first punch is in, next is out , this way ? this way we can calculate actual working time including the launch breack and duration, some times a user can take break for some times, or if he leave at 11am or 12 pm, we easily know that the launch break will not be appled here because may be he did 8 to 12 pm the 4 hours, if he take a break in this time, we also easily catch this and calcuate correct data. 

